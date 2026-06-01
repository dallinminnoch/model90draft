#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const moduleDefinitions = [
  {
    key: "untreated",
    relativePath: "app/features/lens-analysis/untreated-facts-ledger.js",
    builderName: "buildUntreatedFactsLedger",
    ledgerType: "untreatedFacts",
    sampleRow: {
      factId: "fact-housing-1",
      sourceSurface: "pmi",
      sourceType: "client-entered",
      sourcePath: "pmi.housing.monthlyHousingCost",
      sourceRecordId: "housing-record-1",
      itemType: "housing",
      categoryKey: "housing",
      label: "Housing payment",
      amount: 2400,
      frequency: "monthly",
      balance: 320000,
      paymentAmount: 2400,
      interestRatePercent: 5.75,
      termMonths: 300,
      startDate: "2026-01-01",
      endDate: "2051-01-01",
      continuesAfterDeath: true,
      ownerCandidates: ["mortgage"],
      supportingFacts: [{ sourcePath: "pmi.housing.address", value: "primary residence" }],
      trace: {
        source: "test",
        rawFactTrace: {
          sourcePath: "pmi.housing.monthlyHousingCost"
        }
      }
    },
    invalidRows: [
      null,
      {
        amount: "not numeric",
        trace: { source: "invalid untreated row" }
      }
    ],
    verifySample(row) {
      assert.equal(row.factId, "fact-housing-1");
      assert.equal(row.sourcePath, "pmi.housing.monthlyHousingCost");
      assert.equal(row.trace.rawFactTrace.sourcePath, "pmi.housing.monthlyHousingCost");
      assert.equal(row.effectiveTreatmentMode, undefined);
      assert.equal(row.effectiveInflationRatePercent, undefined);
      assert.equal(row.annualRows, undefined);
    }
  },
  {
    key: "treated",
    relativePath: "app/features/lens-analysis/treated-facts-ledger.js",
    builderName: "buildTreatedFactsLedger",
    ledgerType: "treatedFacts",
    sampleRow: {
      treatedFactId: "treated-housing-1",
      sourceFactId: "fact-housing-1",
      itemType: "housing",
      effectiveOwnerComponent: "mortgage",
      effectiveTreatmentMode: "analysisSetup",
      effectiveInflationTreatment: "apply",
      effectiveInflationRatePercent: 3,
      effectiveGrowthTreatment: "none",
      effectiveGrowthRatePercent: 0,
      effectiveDebtTreatment: "amortized",
      effectiveSupportTreatment: "none",
      inclusionStatus: "included",
      exclusionReason: null,
      treatmentSourceTrace: {
        owner: "analysis-setup",
        sourceFactId: "fact-housing-1"
      }
    },
    invalidRows: [
      "not a row",
      {
        effectiveOwnerComponent: "futureOwner",
        effectiveInflationRatePercent: "not numeric"
      }
    ],
    verifySample(row) {
      assert.equal(row.treatedFactId, "treated-housing-1");
      assert.equal(row.sourceFactId, "fact-housing-1");
      assert.equal(row.treatmentSourceTrace.sourceFactId, "fact-housing-1");
      assert.equal(row.annualRows, undefined);
    }
  },
  {
    key: "projection",
    relativePath: "app/features/lens-analysis/projection-ledger.js",
    builderName: "buildProjectionLedger",
    ledgerType: "projection",
    sampleRow: {
      projectionRowId: "projection-housing-1",
      treatedFactId: "treated-housing-1",
      sourceFactId: "fact-housing-1",
      itemType: "housing",
      ownerComponent: "mortgage",
      projectionMode: "diagnosticOnly",
      projectionGranularity: "annualAndMonthly",
      annualRows: [
        {
          yearIndex: 0,
          calendarYear: 2026,
          amount: 28800,
          balance: 320000,
          paymentAmount: 28800,
          inflatedAmount: null,
          growthAmount: null,
          offsetAmount: 0,
          netAmount: 28800,
          trace: { sourceFactId: "fact-housing-1" }
        }
      ],
      monthlyRows: [
        {
          yearIndex: 0,
          monthIndex: 0,
          calendarYear: 2026,
          amount: 2400,
          balance: 319700,
          paymentAmount: 2400,
          netAmount: 2400,
          trace: { sourceFactId: "fact-housing-1" }
        }
      ],
      payoffDate: null,
      depletionDate: null,
      terminalValue: 0,
      trace: {
        sourceFactId: "fact-housing-1",
        treatedFactId: "treated-housing-1"
      }
    },
    invalidRows: [
      undefined,
      {
        projectionGranularity: "weekly",
        annualRows: ["not a projected row"]
      }
    ],
    verifySample(row) {
      assert.equal(row.projectionRowId, "projection-housing-1");
      assert.equal(row.treatedFactId, "treated-housing-1");
      assert.equal(row.sourceFactId, "fact-housing-1");
      assert.equal(row.annualRows.length, 1);
      assert.equal(row.monthlyRows.length, 1);
      assert.equal(row.trace.sourceFactId, "fact-housing-1");
    }
  },
  {
    key: "analysisOutput",
    relativePath: "app/features/lens-analysis/analysis-output-ledger.js",
    builderName: "buildAnalysisOutputLedger",
    ledgerType: "analysisOutput",
    sampleRow: {
      analysisRowId: "coverage-output-housing-1",
      analysisType: "coverageStrategy",
      projectionRowId: "projection-housing-1",
      treatedFactId: "treated-housing-1",
      sourceFactId: "fact-housing-1",
      included: true,
      displayGroup: "Housing",
      outputComponent: "Need Line",
      rowRole: "diagnosticOnly",
      annualAmountsByYear: {
        2026: 28800
      },
      resourceApplications: [],
      offsets: [],
      trace: {
        projectionRowId: "projection-housing-1",
        sourceFactId: "fact-housing-1"
      }
    },
    invalidRows: [
      42,
      {
        analysisType: "unsupportedAnalysis",
        rowRole: "unsupportedRole"
      }
    ],
    verifySample(row) {
      assert.equal(row.analysisRowId, "coverage-output-housing-1");
      assert.equal(row.analysisType, "coverageStrategy");
      assert.equal(row.projectionRowId, "projection-housing-1");
      assert.equal(row.treatedFactId, "treated-housing-1");
      assert.equal(row.sourceFactId, "fact-housing-1");
      assert.equal(row.trace.sourceFactId, "fact-housing-1");
    }
  }
];

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadInVm(relativePath) {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readRepoFile(relativePath), context, {
    filename: path.join(repoRoot, relativePath)
  });
  return context.LensApp.lensAnalysis;
}

function requireFresh(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  delete require.cache[require.resolve(absolutePath)];
  return require(absolutePath);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertEnvelope(definition, envelope, expectedRowCount) {
  assert.equal(envelope.ledgerType, definition.ledgerType);
  assert.equal(typeof envelope.version, "string");
  assert.equal(envelope.diagnosticOnly, true);
  assert.equal(envelope.ledgerDrivesGraph, false);
  assert.equal(envelope.graphMathChanged, false);
  assert.ok(Array.isArray(envelope.rows));
  assert.equal(envelope.rowCount, expectedRowCount);
  assert.ok(Array.isArray(envelope.warnings));
  assert.ok(Array.isArray(envelope.dataGaps));
  assert.ok(envelope.trace);
  assert.doesNotThrow(() => JSON.stringify(envelope));
}

function listJavaScriptFiles(startDirectory) {
  return fs.readdirSync(startDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(startDirectory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [absolutePath] : [];
  });
}

moduleDefinitions.forEach((definition) => {
  const source = readRepoFile(definition.relativePath);
  assert.doesNotThrow(() => new vm.Script(source), `${definition.relativePath} should parse`);
  assert.doesNotMatch(source, /\bdocument\b/);
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bsessionStorage\b/);
  assert.doesNotMatch(source, /\bquerySelector\b/);

  const vmExports = loadInVm(definition.relativePath);
  const commonJsExports = requireFresh(definition.relativePath);
  const vmBuilder = vmExports[definition.builderName];
  const commonJsBuilder = commonJsExports[definition.builderName];
  assert.equal(typeof vmBuilder, "function", `${definition.builderName} should exist on LensApp.lensAnalysis`);
  assert.equal(typeof commonJsBuilder, "function", `${definition.builderName} should exist on CommonJS exports`);

  const emptyEnvelope = vmBuilder();
  assertEnvelope(definition, emptyEnvelope, 0);
  assert.equal(emptyEnvelope.trace.sourceRowStatus, "no source rows supplied");

  const input = { rows: [cloneJson(definition.sampleRow)] };
  const originalInput = cloneJson(input);
  const builtOnce = vmBuilder(input);
  const builtTwice = vmBuilder(input);
  assert.deepEqual(input, originalInput, `${definition.builderName} must not mutate input`);
  assert.deepEqual(builtOnce, builtTwice, `${definition.builderName} must be deterministic`);
  assertEnvelope(definition, builtOnce, 1);
  definition.verifySample(builtOnce.rows[0]);

  const commonJsBuilt = commonJsBuilder(input);
  assert.deepEqual(
    cloneJson(commonJsBuilt),
    cloneJson(builtOnce),
    `${definition.builderName} CommonJS and global builders should match as serializable contracts`
  );

  const invalidInput = { rows: cloneJson(definition.invalidRows) };
  assert.doesNotThrow(() => vmBuilder(invalidInput), `${definition.builderName} should not throw for ordinary invalid rows`);
  const invalidEnvelope = vmBuilder(invalidInput);
  assert.ok(
    invalidEnvelope.warnings.length > 0 || invalidEnvelope.dataGaps.length > 0,
    `${definition.builderName} should report invalid rows through warnings or dataGaps`
  );
  assert.doesNotThrow(() => JSON.stringify(invalidEnvelope), `${definition.builderName} invalid output should be serializable`);
});

const lensAnalysisDirectory = path.join(repoRoot, "app", "features", "lens-analysis");
const pageDirectory = path.join(repoRoot, "pages");
const newModuleBasenames = new Set(moduleDefinitions.map((definition) => path.basename(definition.relativePath)));
const newBuilderNames = moduleDefinitions.map((definition) => definition.builderName);
const newModuleNamePatterns = moduleDefinitions.map((definition) => path.basename(definition.relativePath, ".js"));

listJavaScriptFiles(lensAnalysisDirectory)
  .filter((absolutePath) => !newModuleBasenames.has(path.basename(absolutePath)))
  .forEach((absolutePath) => {
    const source = fs.readFileSync(absolutePath, "utf8");
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
    newBuilderNames.forEach((builderName) => {
      assert.doesNotMatch(source, new RegExp(`\\b${builderName}\\b`), `${relativePath} should not consume ${builderName}`);
    });
    newModuleNamePatterns.forEach((moduleName) => {
      assert.doesNotMatch(source, new RegExp(moduleName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")), `${relativePath} should not import ${moduleName}`);
    });
  });

fs.readdirSync(pageDirectory)
  .filter((fileName) => fileName.endsWith(".html"))
  .forEach((fileName) => {
    const source = fs.readFileSync(path.join(pageDirectory, fileName), "utf8");
    newModuleNamePatterns.forEach((moduleName) => {
      assert.doesNotMatch(source, new RegExp(`${moduleName}\\.js`), `${fileName} should not load ${moduleName}.js`);
    });
  });

console.log("MODEL90 ledger contract shells check passed");
