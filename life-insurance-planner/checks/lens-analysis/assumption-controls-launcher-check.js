#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createClassList(element) {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
      element.className = Array.from(values).join(" ");
    },
    remove(value) {
      values.delete(value);
      element.className = Array.from(values).join(" ");
    },
    contains(value) {
      return values.has(value);
    }
  };
}

function matchesSelector(element, selector) {
  const dataMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (dataMatch) {
    const [, name, expectedValue] = dataMatch;
    if (!(name in element.attributes)) {
      return false;
    }
    return expectedValue === undefined || element.attributes[name] === expectedValue;
  }
  return false;
}

function createElement(tagName, documentRef) {
  const element = {
    tagName: String(tagName || "div").toUpperCase(),
    attributes: {},
    children: [],
    className: "",
    hidden: false,
    innerHTML: "",
    eventListeners: {},
    contentWindow: {},
    classList: null,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "class") {
        this.className = String(value);
      }
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === "class") {
        this.className = "";
      }
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener(eventName, callback) {
      this.eventListeners[eventName] = this.eventListeners[eventName] || [];
      this.eventListeners[eventName].push(callback);
    },
    focus() {
      documentRef.activeElement = this;
    },
    querySelector(selector) {
      return findFirst(this.children, selector);
    },
    querySelectorAll(selector) {
      return findAll(this.children, selector);
    },
    click() {
      (this.eventListeners.click || []).forEach(function (callback) {
        callback({ target: element });
      });
    },
    dispatch(eventName) {
      (this.eventListeners[eventName] || []).forEach(function (callback) {
        callback({ target: element });
      });
    }
  };
  element.classList = createClassList(element);
  return element;
}

function findFirst(elements, selector) {
  for (const element of elements) {
    if (matchesSelector(element, selector)) {
      return element;
    }
    const child = findFirst(element.children || [], selector);
    if (child) {
      return child;
    }
  }
  return null;
}

function findAll(elements, selector, results = []) {
  elements.forEach(function (element) {
    if (matchesSelector(element, selector)) {
      results.push(element);
    }
    findAll(element.children || [], selector, results);
  });
  return results;
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const launcherSource = readRepoFile("app/features/lens-analysis/assumption-controls-launcher.js");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const componentsSource = readRepoFile("components.css");

assert.match(pageSource, /data-lens-assumption-controls-open/);
assert.match(
  pageSource,
  /assumption-controls-launcher\.js"><\/script>\s*<script src="\.\.\/app\/features\/lens-analysis\/income-loss-impact-display\.js"><\/script>/,
  "Income Impact should load the reusable launcher before display code."
);
assert.doesNotMatch(displaySource, /getIncomeImpactAssumptionsEmbedRoute/);
assert.doesNotMatch(displaySource, /data-income-impact-assumptions-overlay/);
assert.match(launcherSource, /lensAnalysis\.assumptionControlsLauncher = \{/);
assert.match(launcherSource, /DEFAULT_TRIGGER_SELECTOR = "\[data-lens-assumption-controls-open\]"/);
assert.match(launcherSource, /targetUrl\.searchParams\.set\("embedAssumptions", "1"\)/);
assert.match(launcherSource, /targetUrl\.searchParams\.set\("embedSession", String\(Date\.now\(\)\)\)/);
assert.match(launcherSource, /iframe\.removeAttribute\("src"\)/);
assert.doesNotMatch(launcherSource, /dialog__close/);
assert.match(analysisSetupSource, /model90:analysis-setup:assumptions-embed-closed/);
assert.match(launcherSource, /model90:analysis-setup:assumptions-embed-closed/);
assert.match(componentsSource, /\.lens-assumption-controls-overlay\s*\{/);
assert.match(componentsSource, /\.lens-assumption-controls-dialog__frame\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*border:\s*0;[^}]*\}/);
assert.match(componentsSource, /\.lens-assumption-controls-overlay\[data-loading="true"\] \.lens-assumption-controls-dialog__loading\s*\{[^}]*opacity:\s*1;[^}]*\}/);

const domReadyCallbacks = [];
const windowListeners = {};
let reloadCount = 0;
const document = {
  readyState: "loading",
  activeElement: null,
  body: null,
  createElement(tagName) {
    return createElement(tagName, document);
  },
  querySelector(selector) {
    return this.body.querySelector(selector);
  },
  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  },
  addEventListener(eventName, callback) {
    if (eventName === "DOMContentLoaded") {
      domReadyCallbacks.push(callback);
    }
  }
};
document.body = createElement("body", document);
const trigger = createElement("button", document);
trigger.setAttribute("data-lens-assumption-controls-open", "");
document.body.appendChild(trigger);

const sandbox = {
  document,
  URL,
  URLSearchParams,
  window: {
    document,
    location: {
      href: "http://127.0.0.1/pages/income-loss-impact.html?caseRef=CL%2F90001&profileId=profile-1",
      search: "?caseRef=CL%2F90001&profileId=profile-1",
      reload() {
        reloadCount += 1;
      }
    },
    addEventListener(eventName, callback) {
      windowListeners[eventName] = windowListeners[eventName] || [];
      windowListeners[eventName].push(callback);
    },
    LensApp: {
      lensAnalysis: {}
    }
  }
};
sandbox.window.window = sandbox.window;

vm.createContext(sandbox);
vm.runInContext(launcherSource, sandbox, {
  filename: "assumption-controls-launcher.js"
});

assert.equal(typeof sandbox.window.LensApp.lensAnalysis.assumptionControlsLauncher.openAssumptionControls, "function");
assert.equal(domReadyCallbacks.length, 1, "launcher should defer default binding until DOMContentLoaded.");
domReadyCallbacks[0]();

assert.equal(trigger.__lensAssumptionControlsBound, true, "generic trigger should be bound.");
trigger.click();

const overlay = document.querySelector("[data-lens-assumption-controls-overlay]");
assert.ok(overlay, "launcher should create a reusable overlay.");
assert.equal(overlay.hidden, false);
assert.equal(overlay.attributes["data-loading"], "true");
assert.equal(document.body.classList.contains("lens-assumption-controls-open"), true);

const iframe = overlay.querySelector("[data-lens-assumption-controls-frame]");
assert.ok(iframe, "launcher should host Analysis Setup in an iframe.");
assert.match(iframe.attributes.src, /^analysis-setup\.html\?/);
assert.match(iframe.attributes.src, /caseRef=CL%2F90001/);
assert.match(iframe.attributes.src, /profileId=profile-1/);
assert.match(iframe.attributes.src, /embedAssumptions=1/);
assert.match(iframe.attributes.src, /embedSession=/);
assert.equal(document.activeElement, iframe);

iframe.dispatch("load");
assert.equal("data-loading" in overlay.attributes, false);

assert.equal(windowListeners.message.length, 1, "launcher should bind one parent message listener.");
windowListeners.message[0]({
  data: {
    type: "model90:analysis-setup:assumptions-embed-closed",
    saved: true
  },
  source: iframe.contentWindow
});

assert.equal(overlay.hidden, true);
assert.equal("src" in iframe.attributes, false, "closing should clear iframe src to avoid stale blank sessions.");
assert.equal(document.body.classList.contains("lens-assumption-controls-open"), false);
assert.equal(document.activeElement, trigger, "closing should restore focus to the launcher trigger.");
assert.equal(reloadCount, 1, "saved embedded sessions should reload the host page.");

console.log("Assumption Controls launcher contract check passed.");
