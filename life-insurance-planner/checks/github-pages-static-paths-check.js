const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const appRoot = path.join(repoRoot, "life-insurance-planner");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listFiles(directory, extension) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFiles(fullPath, extension);
      }
      return entry.isFile() && entry.name.endsWith(extension) ? [fullPath] : [];
    });
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function assertNoRootRelativeAppPaths(filePath, source) {
  const forbiddenPatterns = [
    /\bhref=(["'])\/(?!\/|https?:|mailto:|tel:|#)/,
    /\bsrc=(["'])\/(?!\/|https?:|mailto:|tel:|#)/,
    /\bfetch\((["'])\/(?!\/|https?:)/,
    /\b(?:window\.)?location\.href\s*=\s*(["'])\/(?!\/|https?:)/,
    /\bwindow\.location\s*=\s*(["'])\/(?!\/|https?:)/,
    /\/life-insurance-planner\//,
    /\/model90draft\//
  ];

  forbiddenPatterns.forEach((pattern) => {
    assert(
      !pattern.test(source),
      `${filePath} should not use root-relative app paths that break GitHub Pages project hosting`
    );
  });
}

const htmlFiles = listFiles(appRoot, ".html");
htmlFiles.forEach((filePath) => {
  assertNoRootRelativeAppPaths(relative(filePath), fs.readFileSync(filePath, "utf8"));
});

const jsFiles = listFiles(appRoot, ".js").filter((filePath) => !relative(filePath).startsWith("life-insurance-planner/checks/"));
jsFiles.forEach((filePath) => {
  assertNoRootRelativeAppPaths(relative(filePath), fs.readFileSync(filePath, "utf8"));
});

const cssFiles = listFiles(appRoot, ".css");
cssFiles.forEach((filePath) => {
  const fileSource = fs.readFileSync(filePath, "utf8");
  const fileName = relative(filePath);
  assert(!/url\((["']?)\//.test(fileSource), `${fileName} should not use root-relative CSS asset URLs`);
  assert(!/url\((["']?)\.\.\/Images\//.test(fileSource), `${fileName} is app-root CSS and should resolve Images from the app root`);
});

const indexHtml = read("life-insurance-planner/index.html");
assert.match(indexHtml, /<link rel="stylesheet" href="styles\.css">/, "index.html should load styles.css from the app root");
assert.match(indexHtml, /<script src="app\/core\/config\.js"><\/script>/, "index.html should load app scripts from the app root");
assert.match(indexHtml, /src="Images\/MODEL 90 \(30 x 10 in\)\.png"/, "index.html should load images from the app root");
assert.match(indexHtml, /href="pages\/clients\.html"/, "index.html should link to pages with a relative pages/ path");
assert.doesNotMatch(indexHtml, /href="\/styles\.css"/, "index.html should not use /styles.css");

[
  "coverage-strategy.html",
  "income-loss-impact.html",
  "clients.html",
  "analysis-setup.html"
].forEach((pageName) => {
  const source = read(`life-insurance-planner/pages/${pageName}`);
  assert.match(source, /<link rel="stylesheet" href="\.\.\/styles\.css">/, `${pageName} should load root CSS with ../styles.css`);
  assert.match(source, /src="\.\.\/app\//, `${pageName} should load app scripts with ../app/`);
  assert.match(source, /href=(["'])\.\.\/index\.html\1/, `${pageName} should link back to the app root with ../index.html`);
});

console.log("GitHub Pages static path checks passed.");
