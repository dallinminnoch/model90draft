(function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function sanitizeExpression(value) {
    return String(value || "").replace(/[^0-9+\-*/().%\s]/g, "");
  }

  function normalizeExpression(value) {
    return sanitizeExpression(value).replace(/%/g, "/100");
  }

  function evaluateExpression(value) {
    const expression = normalizeExpression(value).replace(/\s+/g, "");

    if (!expression) {
      return null;
    }

    if (!/^[0-9+\-*/().]+$/.test(expression)) {
      return null;
    }

    try {
      const result = Function(`"use strict"; return (${expression});`)();
      return Number.isFinite(result) ? result : null;
    } catch (_error) {
      return null;
    }
  }

  function formatComputedValue(value) {
    if (!Number.isFinite(value)) {
      return "";
    }
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function setCaretPosition(input, position) {
    input.focus();
    input.setSelectionRange(position, position);
  }

  function buildExpressionLine() {
    const expression = document.createElement("div");
    expression.className = "floating-calculator-expression";
    expression.textContent = "";
    return expression;
  }

  function buildPad() {
    return `
      <button type="button" data-calculator-action="clear">C</button>
      <button type="button" data-calculator-action="parens">()</button>
      <button type="button" data-calculator-action="percent">%</button>
      <button type="button" data-calculator-value="/">/</button>
      <button type="button" data-calculator-value="7">7</button>
      <button type="button" data-calculator-value="8">8</button>
      <button type="button" data-calculator-value="9">9</button>
      <button type="button" data-calculator-value="*">*</button>
      <button type="button" data-calculator-value="4">4</button>
      <button type="button" data-calculator-value="5">5</button>
      <button type="button" data-calculator-value="6">6</button>
      <button type="button" data-calculator-value="-">-</button>
      <button type="button" data-calculator-value="1">1</button>
      <button type="button" data-calculator-value="2">2</button>
      <button type="button" data-calculator-value="3">3</button>
      <button type="button" data-calculator-value="+">+</button>
      <button type="button" data-calculator-action="sign">+/-</button>
      <button type="button" data-calculator-value="0">0</button>
      <button type="button" data-calculator-value=".">.</button>
      <button type="button" data-calculator-action="equals" class="floating-calculator-equals">=</button>
    `;
  }

  function initializePmiCalculator() {
    const toggleButton = document.querySelector("[data-calculator-toggle]");
    const calculatorId = toggleButton?.getAttribute("aria-controls");
    const calculator = calculatorId
      ? document.getElementById(calculatorId)
      : document.querySelector(".floating-calculator");
    const closeButton = calculator ? calculator.querySelector(".floating-calculator-close") : null;
    const dragHandle = calculator ? calculator.querySelector("[data-calculator-drag-handle]") : null;
    const display = calculator ? calculator.querySelector(".floating-calculator-display") : null;
    const pad = calculator ? calculator.querySelector(".floating-calculator-pad") : null;

    if (!toggleButton || !calculator || !closeButton || !dragHandle || !display || !pad) {
      return;
    }

    if (calculator.dataset.calculatorEnhanced === "true") {
      return;
    }
    calculator.dataset.calculatorEnhanced = "true";
    closeButton.textContent = "×";

    let displayShell = calculator.querySelector(".floating-calculator-display-shell");
    if (!displayShell) {
      displayShell = document.createElement("div");
      displayShell.className = "floating-calculator-display-shell";
      const expressionLine = buildExpressionLine();
      display.parentNode.insertBefore(displayShell, display);
      displayShell.appendChild(expressionLine);
      displayShell.appendChild(display);
    }

    const expressionLine = calculator.querySelector(".floating-calculator-expression");
    pad.innerHTML = buildPad();

    let dragState = null;

    function updateExpressionLine(value) {
      if (expressionLine) {
        expressionLine.textContent = String(value || "").trim();
      }
    }

    function setDisplayValue(value) {
      display.value = sanitizeExpression(value);
    }

    function insertAtCursor(text, caretOffset) {
      const start = display.selectionStart ?? display.value.length;
      const end = display.selectionEnd ?? display.value.length;
      const nextValue = `${display.value.slice(0, start)}${text}${display.value.slice(end)}`;
      setDisplayValue(nextValue);
      const nextPosition = start + (caretOffset ?? text.length);
      setCaretPosition(display, nextPosition);
      updateExpressionLine(display.value);
    }

    function applyPercent() {
      const currentValue = display.value.trim();
      if (!currentValue) {
        return;
      }
      const result = evaluateExpression(currentValue);
      if (result === null) {
        return;
      }
      const nextValue = formatComputedValue(result / 100);
      setDisplayValue(nextValue);
      updateExpressionLine(`${currentValue} %`);
      setCaretPosition(display, display.value.length);
    }

    function applySignToggle() {
      const currentValue = display.value.trim();
      if (!currentValue) {
        setDisplayValue("-");
        updateExpressionLine(display.value);
        setCaretPosition(display, display.value.length);
        return;
      }

      const result = evaluateExpression(currentValue);
      if (result !== null) {
        const nextValue = formatComputedValue(result * -1);
        setDisplayValue(nextValue);
        updateExpressionLine(nextValue);
        setCaretPosition(display, display.value.length);
        return;
      }

      if (currentValue.startsWith("-")) {
        setDisplayValue(currentValue.slice(1));
      } else {
        setDisplayValue(`-${currentValue}`);
      }
      updateExpressionLine(display.value);
      setCaretPosition(display, display.value.length);
    }

    function applyParens() {
      const value = display.value;
      const opens = (value.match(/\(/g) || []).length;
      const closes = (value.match(/\)/g) || []).length;
      const nextChar = opens > closes ? ")" : "(";
      insertAtCursor(nextChar);
    }

    function applyEquals() {
      const currentValue = display.value.trim();
      const result = evaluateExpression(currentValue);
      if (result === null) {
        return;
      }
      const nextValue = formatComputedValue(result);
      setDisplayValue(nextValue);
      updateExpressionLine(currentValue);
      setCaretPosition(display, display.value.length);
    }

    function resetCalculatorPosition() {
      const margin = 24;
      const width = calculator.offsetWidth || 356;
      const left = clamp(window.innerWidth - width - margin, margin, Math.max(margin, window.innerWidth - width - margin));
      const top = clamp(132, margin, Math.max(margin, window.innerHeight - calculator.offsetHeight - margin));
      calculator.style.left = `${left}px`;
      calculator.style.top = `${top}px`;
    }

    function openCalculator() {
      calculator.hidden = false;
      calculator.classList.add("is-open");
      toggleButton.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        resetCalculatorPosition();
        display.focus();
        setCaretPosition(display, display.value.length);
      });
    }

    function closeCalculator() {
      calculator.hidden = true;
      calculator.classList.remove("is-open");
      toggleButton.setAttribute("aria-expanded", "false");
      dragState = null;
    }

    toggleButton.addEventListener("click", () => {
      if (calculator.hidden) {
        openCalculator();
      } else {
        closeCalculator();
      }
    });

    closeButton.addEventListener("click", closeCalculator);

    dragHandle.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".floating-calculator-close")) {
        return;
      }
      event.preventDefault();
      dragState = {
        offsetX: event.clientX - calculator.getBoundingClientRect().left,
        offsetY: event.clientY - calculator.getBoundingClientRect().top,
      };
      dragHandle.setPointerCapture(event.pointerId);
    });

    dragHandle.addEventListener("pointermove", (event) => {
      if (!dragState) {
        return;
      }
      const maxLeft = Math.max(16, window.innerWidth - calculator.offsetWidth - 16);
      const maxTop = Math.max(16, window.innerHeight - calculator.offsetHeight - 16);
      const nextLeft = clamp(event.clientX - dragState.offsetX, 16, maxLeft);
      const nextTop = clamp(event.clientY - dragState.offsetY, 16, maxTop);
      calculator.style.left = `${nextLeft}px`;
      calculator.style.top = `${nextTop}px`;
    });

    function clearDragState(pointerId) {
      if (dragState) {
        dragState = null;
      }
      try {
        dragHandle.releasePointerCapture(pointerId);
      } catch (_error) {
        return;
      }
    }

    dragHandle.addEventListener("pointerup", (event) => clearDragState(event.pointerId));
    dragHandle.addEventListener("pointercancel", (event) => clearDragState(event.pointerId));
    dragHandle.addEventListener("lostpointercapture", () => {
      dragState = null;
    });

    pad.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }

      const action = button.dataset.calculatorAction;
      if (action === "clear") {
        setDisplayValue("");
        updateExpressionLine("");
        display.focus();
        return;
      }
      if (action === "parens") {
        applyParens();
        return;
      }
      if (action === "percent") {
        applyPercent();
        return;
      }
      if (action === "sign") {
        applySignToggle();
        return;
      }
      if (action === "equals") {
        applyEquals();
        return;
      }

      const value = button.dataset.calculatorValue;
      if (value) {
        insertAtCursor(value);
      }
    });

    display.addEventListener("input", () => {
      const start = display.selectionStart ?? display.value.length;
      const sanitized = sanitizeExpression(display.value);
      display.value = sanitized;
      updateExpressionLine(sanitized);
      setCaretPosition(display, Math.min(start, sanitized.length));
    });

    display.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyEquals();
      }
      if (event.key === "%") {
        event.preventDefault();
        applyPercent();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !calculator.hidden) {
        closeCalculator();
      }
    });

    window.addEventListener("resize", () => {
      if (!calculator.hidden) {
        resetCalculatorPosition();
      }
    });

    updateExpressionLine(display.value);
    closeCalculator();
  }

  window.initializePmiCalculator = initializePmiCalculator;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePmiCalculator, { once: true });
  } else {
    initializePmiCalculator();
  }
})();
