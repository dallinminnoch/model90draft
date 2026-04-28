window.PlannerCharts = {
  renderEstimateNeedPlaceholder(containerId) {
    const container = document.getElementById(containerId);

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div>
        <div class="chart-shell" id="${containerId}-chart" aria-hidden="true">
          <div class="chart-core">
            <span class="chart-core-label">Estimate</span>
          </div>
        </div>
        <h3 class="card-title">Future Donut Chart</h3>
        <p class="card-copy">Reserved for a later Chart.js implementation such as death benefit need breakdown or covered versus uncovered need.</p>
      </div>
    `;

    const chart = document.getElementById(`${containerId}-chart`);
    if (!chart) {
      return;
    }

    animateDonut(chart, 72, 1800);
  }
};

function animateDonut(chart, targetPercent, duration) {
  const clampedTarget = Math.max(0, Math.min(targetPercent, 100));
  const startTime = performance.now();

  chart.style.setProperty("--chart-fill", "0deg");
  chart.style.setProperty("--chart-rotation", "0deg");

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const fillDegrees = (clampedTarget / 100) * 360 * eased;
    const rotationDegrees = 360 * eased;

    chart.style.setProperty("--chart-fill", `${fillDegrees}deg`);
    chart.style.setProperty("--chart-rotation", `${rotationDegrees}deg`);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
