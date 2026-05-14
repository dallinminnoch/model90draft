#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const path = require("node:path");

const checksDir = __dirname;
const projectRoot = path.resolve(checksDir, "..");
const repoRoot = resolveGitRoot(projectRoot) || path.resolve(projectRoot, "..");

const steps = [
  {
    label: "Syntax check Income Impact suite runner",
    command: process.execPath,
    args: ["--check", __filename],
    cwd: projectRoot
  },
  {
    label: "Income Impact timeline graph model",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-timeline-graph-model-v1-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact financial storyline candidates",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-financial-storyline-candidates-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact resource bucket adapter",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-resource-bucket-adapter-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact asset depletion ledger",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-asset-depletion-ledger-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact asset depletion ledger diagnostic integration",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-asset-depletion-ledger-diagnostic-integration-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact saved profile asset bucket flow",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-saved-profile-asset-bucket-flow-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact resource waterfall",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-resource-waterfall-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact housing risk",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-housing-risk-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Loss Impact visual timeline",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-loss-impact-visual-timeline-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Loss Impact scenario banner",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-loss-impact-scenario-banner-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Loss Impact compression reporting display",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-loss-impact-compression-reporting-display-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact lifestyle scenario calculations",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-lifestyle-scenario-calculations-check.js")],
    cwd: projectRoot
  },
  {
    label: "Income Impact auto-compressed baseline",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/lens-analysis/income-impact-auto-compressed-baseline-check.js")],
    cwd: projectRoot
  },
  {
    label: "Household expense account policy runtime integration",
    command: process.execPath,
    args: [path.join(projectRoot, "checks/account-settings/household-expense-account-policy-runtime-integration-check.js")],
    cwd: projectRoot
  },
  {
    label: "Git diff whitespace check",
    command: "git",
    args: ["diff", "--check"],
    cwd: repoRoot
  }
];

function resolveGitRoot(startDir) {
  const result = childProcess.spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: startDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function formatCommand(command, args) {
  return [command].concat(args).join(" ");
}

function runStep(step) {
  console.log(`\n=== ${step.label} ===`);
  console.log(`$ ${formatCommand(step.command, step.args)}`);
  const result = childProcess.spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`Failed to start ${step.label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`${step.label} stopped by signal ${result.signal}.`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${step.label} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

steps.forEach(runStep);

console.log(`\nIncome Impact suite passed (${steps.length} steps).`);
