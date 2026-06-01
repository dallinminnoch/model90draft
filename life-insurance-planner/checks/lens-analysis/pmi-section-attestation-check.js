#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function assertAttestationField(source, pagePath, name) {
  assert.match(
    source,
    new RegExp(`<input type="radio" name="${name}" value="yes">`),
    `${pagePath} should include the Yes option for ${name}.`
  );
  assert.match(
    source,
    new RegExp(`<input type="radio" name="${name}" value="review">`),
    `${pagePath} should include the review option for ${name}.`
  );
  assert.doesNotMatch(
    source,
    new RegExp(`name="${name}"[^>]*checked`),
    `${pagePath} should not preselect ${name}.`
  );
}

const canonicalSource = readRepoFile("pages/next-step.html");
const confidentialSource = readRepoFile("pages/confidential-inputs.html");
const layoutCss = readRepoFile("layout.css");
const componentsCss = readRepoFile("components.css");

const sharedFields = [
  "pmiIncomeSectionAccuracy",
  "pmiHousingSectionAccuracy",
  "pmiDebtsSectionAccuracy",
  "pmiExpensesSectionAccuracy",
  "pmiAssetsSectionAccuracy",
  "pmiCoverageSectionAccuracy",
  "pmiSurvivorSectionAccuracy",
  "pmiEducationSectionAccuracy",
  "pmiFinalSectionAccuracy"
];

const canonicalOnlyFields = [
  "pmiSavingsHabitsSectionAccuracy"
];

[
  ...sharedFields,
  ...canonicalOnlyFields
].forEach((name) => assertAttestationField(canonicalSource, "pages/next-step.html", name));

sharedFields.forEach((name) => assertAttestationField(confidentialSource, "pages/confidential-inputs.html", name));

assert.equal(
  countMatches(canonicalSource, /<fieldset class="pmi-section-attestation">/g),
  10,
  "Canonical PMI page should include one attestation prompt for each numbered PMI section."
);
assert.equal(
  countMatches(confidentialSource, /<fieldset class="pmi-section-attestation">/g),
  9,
  "Confidential PMI page should include one attestation prompt for each active section card."
);
assert.match(
  canonicalSource,
  /Has this section been recorded accurately to the best of your ability\?/,
  "Canonical PMI page should use the approved professional attestation question."
);
assert.match(
  confidentialSource,
  /No, mark for later review/,
  "Confidential PMI page should include the review option copy."
);
assert.match(
  canonicalSource,
  /if \(element\.type === "radio"\) \{[\s\S]*draft\[element\.name\] = element\.value;/,
  "Canonical PMI serializer should persist selected radio values."
);
assert.match(
  confidentialSource,
  /if \(control instanceof RadioNodeList\) \{[\s\S]*input\.checked = input\.value === value;/,
  "Confidential PMI restore path should hydrate saved radio values."
);
assert.match(
  layoutCss,
  /\.profile-creation-form \.pmi-section-attestation\s*{[\s\S]*padding:\s*14px 22px 18px;/,
  "PMI attestation spacing should be owned by layout.css."
);
assert.match(
  componentsCss,
  /\.profile-creation-form \.pmi-section-attestation-option:has\(input:checked\)\s*{[\s\S]*background:\s*var\(--m90-accent-soft\);/,
  "PMI attestation selected state should be tokenized in components.css."
);

console.log("pmi-section-attestation-check passed");
