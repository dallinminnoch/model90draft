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

function existsWithExactCase(filePath) {
  const resolvedPath = path.resolve(filePath);
  const parsed = path.parse(resolvedPath);
  const parts = resolvedPath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let currentPath = parsed.root;

  return parts.every((part) => {
    let entries;
    try {
      entries = fs.readdirSync(currentPath);
    } catch (error) {
      return false;
    }

    if (!entries.includes(part)) {
      return false;
    }

    currentPath = path.join(currentPath, part);
    return true;
  });
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
  const source = fs.readFileSync(filePath, "utf8");
  const fileName = relative(filePath);
  assertNoRootRelativeAppPaths(fileName, source);

  Array.from(source.matchAll(/\b(?:src|href)=(["'])([^"']*\.(?:svg|png|jpg|jpeg|webp))\1/gi)).forEach((match) => {
    const assetPath = match[2];
    if (/^(?:https?:|data:|blob:|#)/.test(assetPath)) {
      return;
    }

    assert(
      existsWithExactCase(path.resolve(path.dirname(filePath), assetPath)),
      `${fileName} references missing or case-mismatched image asset ${assetPath}`
    );
  });
});

const jsFiles = listFiles(appRoot, ".js").filter((filePath) => !relative(filePath).startsWith("life-insurance-planner/checks/"));
jsFiles.forEach((filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  const fileName = relative(filePath);
  assertNoRootRelativeAppPaths(fileName, source);

  Array.from(source.matchAll(/(["'])([^"']*Images\/[^"']*\.(?:svg|png|jpg|jpeg|webp))\1/gi)).forEach((match) => {
    const assetPath = match[2];
    const resolutionBase = assetPath.startsWith("../") ? path.join(appRoot, "pages") : appRoot;
    assert(
      existsWithExactCase(path.resolve(resolutionBase, assetPath)),
      `${fileName} references missing or case-mismatched image asset ${assetPath}`
    );
  });
});

const cssFiles = listFiles(appRoot, ".css");
cssFiles.forEach((filePath) => {
  const fileSource = fs.readFileSync(filePath, "utf8");
  const fileName = relative(filePath);
  assert(!/url\((["']?)\//.test(fileSource), `${fileName} should not use root-relative CSS asset URLs`);

  if (path.dirname(filePath) === appRoot) {
    assert(!/url\((["']?)\.\.\/Images\//.test(fileSource), `${fileName} is app-root CSS and should resolve Images from the app root`);
  }

  Array.from(fileSource.matchAll(/url\((["']?)(?!data:|#)([^)"' ]*\.(?:svg|png|jpg|jpeg|webp))\1\)/gi)).forEach((match) => {
    const assetPath = match[2];
    assert(
      existsWithExactCase(path.resolve(path.dirname(filePath), assetPath)),
      `${fileName} references missing or case-mismatched CSS image asset ${assetPath}`
    );
  });
});

const indexHtml = read("life-insurance-planner/index.html");
assert.match(indexHtml, /<link rel="stylesheet" href="styles\.css">/, "index.html should load styles.css from the app root");
assert.match(indexHtml, /<script src="app\/core\/config\.js"><\/script>/, "index.html should load app scripts from the app root");
assert.match(indexHtml, /src="Images\/MODEL 90 \(30 x 10 in\)\.png"/, "index.html should load images from the app root");
assert.match(indexHtml, /href="pages\/clients\.html"/, "index.html should link to pages with a relative pages/ path");
assert.doesNotMatch(indexHtml, /href="\/styles\.css"/, "index.html should not use /styles.css");

[
  "MODEL 90 (30 x 10 in).png",
  "checkmark.svg",
  "bell.svg",
  "history_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  "menu.svg",
  "openfullscreen.svg"
].forEach((assetName) => {
  assert(
    existsWithExactCase(path.join(appRoot, "Images", assetName)),
    `critical image asset should exist with exact case: Images/${assetName}`
  );
});

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
