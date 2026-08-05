var InterestReturnUtils = (function () {
  var MAX_PRINCIPAL = 1e12;
  var MAX_RATE = 100;
  var MIN_YEARS = 1;
  var MAX_YEARS = 100;

  function compoundPeriodsPerYear(kind) {
    switch (kind) {
      case "daily":
        return 365;
      case "monthly":
        return 12;
      case "yearly":
        return 1;
      default:
        return 0;
    }
  }

  function futureValue(principal, annualRate, years, compoundKind) {
    var r = annualRate / 100;
    if (years <= 0) {
      return principal;
    }
    if (compoundKind === "none" || compoundPeriodsPerYear(compoundKind) === 0) {
      return principal * (1 + r * years);
    }
    var n = compoundPeriodsPerYear(compoundKind);
    return principal * Math.pow(1 + r / n, n * years);
  }

  function seriesCompound(principal, annualRate, years, compoundKind) {
    var points = [{ year: 0, value: principal }];
    for (var y = 1; y <= years; y++) {
      points.push({
        year: y,
        value: futureValue(principal, annualRate, y, compoundKind),
      });
    }
    return points;
  }

  function seriesSimple(principal, annualRate, years) {
    return seriesCompound(principal, annualRate, years, "none");
  }

  function apyFromApr(aprPercent, compoundKind) {
    var r = aprPercent / 100;
    var n = compoundPeriodsPerYear(compoundKind);
    if (n <= 0) {
      return r;
    }
    return Math.pow(1 + r / n, n) - 1;
  }

  function parseYears(raw) {
    if (raw == null || String(raw).trim() === "") {
      return { error: "Years must be between 1 and 100." };
    }
    var text = String(raw).trim();
    var value = Number(text);
    if (!isFinite(value)) {
      return { error: "Years must be a whole number between 1 and 100." };
    }
    if (value !== Math.floor(value)) {
      return { error: "Years must be a whole number (no decimals)." };
    }
    if (value < MIN_YEARS || value > MAX_YEARS) {
      return { error: "Years must be between 1 and 100." };
    }
    return { value: value };
  }

  function validateCommon(principal, rate, years) {
    if (!(principal >= 0) || !isFinite(principal)) {
      return "Principal must be zero or greater.";
    }
    if (principal > MAX_PRINCIPAL) {
      return "Principal must be at most $1,000,000,000,000.";
    }
    if (!(rate >= 0) || !isFinite(rate)) {
      return "Rate must be zero or greater.";
    }
    if (rate > MAX_RATE) {
      return "Rate must be at most 100%.";
    }
    if (!(years >= MIN_YEARS) || years > MAX_YEARS || years !== Math.floor(years)) {
      return "Years must be between 1 and 100.";
    }
    return null;
  }

  function assertFiniteSeries(points) {
    for (var i = 0; i < points.length; i++) {
      if (!isFinite(points[i].value)) {
        return "Result is too large to chart. Try a smaller principal, rate, or term.";
      }
    }
    return null;
  }

  function seriesStepped(principal, periods) {
    if (!(principal >= 0) || !isFinite(principal)) {
      return { error: "Principal must be zero or greater.", points: [] };
    }
    if (principal > MAX_PRINCIPAL) {
      return { error: "Principal must be at most $1,000,000,000,000.", points: [] };
    }
    if (!periods || !periods.length) {
      return { error: "Add at least one rate period.", points: [] };
    }

    var maxYear = 0;
    periods.forEach(function (p) {
      if (p.end > maxYear) {
        maxYear = p.end;
      }
    });
    if (maxYear < 1) {
      return { error: "Add at least one rate period.", points: [] };
    }

    var sorted = periods.slice().sort(function (a, b) {
      return a.start - b.start;
    });
    for (var i = 0; i < sorted.length; i++) {
      var p = sorted[i];
      if (p.start < 1 || p.end < p.start || p.end > MAX_YEARS) {
        return {
          error: "Each period needs From year ≤ To year (1–100).",
          points: [],
        };
      }
      if (!(p.rate >= 0) || !isFinite(p.rate)) {
        return { error: "Rates must be zero or greater.", points: [] };
      }
      if (p.rate > MAX_RATE) {
        return { error: "Rates must be at most 100%.", points: [] };
      }
      if (i > 0 && p.start <= sorted[i - 1].end) {
        return { error: "Rate periods cannot overlap.", points: [] };
      }
      if (i > 0 && p.start !== sorted[i - 1].end + 1) {
        return {
          error: "Rate periods must be contiguous (no gaps between years).",
          points: [],
        };
      }
    }
    if (sorted[0].start !== 1) {
      return { error: "The first period must start at year 1.", points: [] };
    }

    var balance = principal;
    var points = [{ year: 0, value: principal }];
    var rateByYear = {};
    sorted.forEach(function (period) {
      for (var y = period.start; y <= period.end; y++) {
        rateByYear[y] = period.rate;
      }
    });

    for (var year = 1; year <= maxYear; year++) {
      var annualRate = rateByYear[year];
      if (annualRate == null) {
        return { error: "Missing rate for year " + year + ".", points: [] };
      }
      balance = balance * (1 + annualRate / 100);
      if (!isFinite(balance)) {
        return {
          error: "Result is too large to chart. Try a smaller principal, rate, or term.",
          points: [],
        };
      }
      points.push({ year: year, value: balance });
    }
    return { error: null, points: points, periods: sorted, maxYear: maxYear };
  }

  function wrapTextLines(measureText, text, maxWidth) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (measureText(test) > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines.length ? lines : [""];
  }

  return {
    MAX_PRINCIPAL: MAX_PRINCIPAL,
    MAX_RATE: MAX_RATE,
    MIN_YEARS: MIN_YEARS,
    MAX_YEARS: MAX_YEARS,
    compoundPeriodsPerYear: compoundPeriodsPerYear,
    futureValue: futureValue,
    seriesCompound: seriesCompound,
    seriesSimple: seriesSimple,
    apyFromApr: apyFromApr,
    parseYears: parseYears,
    validateCommon: validateCommon,
    assertFiniteSeries: assertFiniteSeries,
    seriesStepped: seriesStepped,
    wrapTextLines: wrapTextLines,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = InterestReturnUtils;
}

(function () {
  if (typeof document === "undefined") {
    return;
  }

  var root = document.getElementById("interestReturnTool");
  if (!root) {
    return;
  }

  var utils = InterestReturnUtils;
  var money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  var moneyExact = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  var pct = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  var modeButtons = Array.prototype.slice.call(root.querySelectorAll(".tool-mode"));
  var panels = Array.prototype.slice.call(root.querySelectorAll(".tool-panel"));
  var statusEl = document.getElementById("irStatus");
  var summaryEl = document.getElementById("irSummary");
  var chartCanvas = document.getElementById("irChart");
  var chartCtx = chartCanvas.getContext("2d");
  var periodsEl = document.getElementById("irSteppedPeriods");

  var currentMode = "growth";
  var lastResult = null;
  var debounceTimer = null;

  var DEFAULTS = {
    growth: { principal: 25000, rate: 3, years: 30, compound: "yearly" },
    compare: { principal: 25000, rate: 3, years: 30 },
    savings: { principal: 10000, apr: 3.7, years: 10, compound: "daily" },
    stepped: {
      principal: 25000,
      periods: [
        { start: 1, end: 5, rate: 2 },
        { start: 6, end: 15, rate: 5 },
        { start: 16, end: 30, rate: 8 },
      ],
    },
  };

  function parseNumber(el, fallback) {
    var value = parseFloat(el.value);
    if (!isFinite(value)) {
      return fallback;
    }
    return value;
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function renderPeriods(periods) {
    periodsEl.textContent = "";
    periods.forEach(function (period, index) {
      var row = document.createElement("div");
      row.className = "tool-period-row";
      row.setAttribute("data-index", String(index));

      var startId = "irPeriodStart" + index;
      var endId = "irPeriodEnd" + index;
      var rateId = "irPeriodRate" + index;
      var fields = document.createElement("div");
      fields.className = "tool-field tool-field--inline";

      function appendField(labelText, id, field, value, step) {
        var label = document.createElement("label");
        label.setAttribute("for", id);
        label.textContent = labelText;
        fields.appendChild(label);

        var input = document.createElement("input");
        input.type = "number";
        input.id = id;
        input.min = field === "rate" ? "0" : "1";
        input.max = field === "rate" ? String(utils.MAX_RATE) : "100";
        input.step = step;
        input.setAttribute("data-field", field);
        input.value = String(value);
        fields.appendChild(input);
      }

      appendField("From year", startId, "start", period.start, "1");
      appendField("To year", endId, "end", period.end, "1");
      appendField("Rate (%)", rateId, "rate", period.rate, "0.1");

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tool-button--secondary tool-period-remove";
      removeBtn.setAttribute("data-index", String(index));
      removeBtn.setAttribute("aria-label", "Remove period " + (index + 1));
      removeBtn.textContent = "Remove";
      fields.appendChild(removeBtn);

      row.appendChild(fields);
      periodsEl.appendChild(row);
    });
  }

  function readPeriods() {
    var rows = periodsEl.querySelectorAll(".tool-period-row");
    var periods = [];
    rows.forEach(function (row) {
      var start = parseInt(row.querySelector('[data-field="start"]').value, 10);
      var end = parseInt(row.querySelector('[data-field="end"]').value, 10);
      var rate = parseFloat(row.querySelector('[data-field="rate"]').value);
      periods.push({
        start: isFinite(start) ? start : 1,
        end: isFinite(end) ? end : 1,
        rate: isFinite(rate) ? rate : 0,
      });
    });
    return periods;
  }

  function summaryItem(label, value) {
    var item = document.createElement("div");
    item.className = "tool-summary-item";

    var labelEl = document.createElement("span");
    labelEl.className = "tool-summary-label";
    labelEl.textContent = label;

    var valueEl = document.createElement("span");
    valueEl.className = "tool-summary-value";
    valueEl.textContent = value;

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return item;
  }

  function renderSummary(items) {
    summaryEl.textContent = "";
    items.forEach(function (item) {
      summaryEl.appendChild(summaryItem(item.label, item.value));
    });
  }

  function measureLabelWidth(text) {
    chartCtx.save();
    chartCtx.font = "12px Verdana, sans-serif";
    var width = chartCtx.measureText(text).width;
    chartCtx.restore();
    return width;
  }

  function drawChart(seriesList, options) {
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = chartCanvas.clientWidth || 720;
    var cssHeight = Math.max(260, Math.round(cssWidth * 0.5));
    chartCanvas.width = Math.round(cssWidth * dpr);
    chartCanvas.height = Math.round(cssHeight * dpr);
    chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var width = cssWidth;
    var height = cssHeight;

    chartCtx.clearRect(0, 0, width, height);
    chartCtx.fillStyle = "#fafafa";
    chartCtx.fillRect(0, 0, width, height);

    var allPoints = [];
    seriesList.forEach(function (s) {
      s.points.forEach(function (p) {
        allPoints.push(p);
      });
    });
    if (!allPoints.length) {
      return;
    }

    var maxYear = 0;
    var minVal = allPoints[0].value;
    var maxVal = allPoints[0].value;
    allPoints.forEach(function (p) {
      if (p.year > maxYear) {
        maxYear = p.year;
      }
      if (p.value < minVal) {
        minVal = p.value;
      }
      if (p.value > maxVal) {
        maxVal = p.value;
      }
    });
    if (maxYear < 1) {
      maxYear = 1;
    }
    if (maxVal === minVal) {
      maxVal = minVal + 1;
    }
    var range = maxVal - minVal;
    minVal = Math.max(0, minVal - range * 0.05);
    maxVal = maxVal + range * 0.08;

    var yTicks = 4;
    var widestTick = 0;
    for (var i = 0; i <= yTicks; i++) {
      var tickValue = minVal + ((maxVal - minVal) * i) / yTicks;
      widestTick = Math.max(widestTick, measureLabelWidth(money.format(tickValue)));
    }
    var pad = {
      top: 16,
      right: 16,
      bottom: 36,
      left: Math.max(64, Math.ceil(widestTick + 16)),
    };
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;
    if (plotW < 40 || plotH < 40) {
      return;
    }

    function xFor(year) {
      return pad.left + (year / maxYear) * plotW;
    }
    function yFor(value) {
      return pad.top + plotH - ((value - minVal) / (maxVal - minVal)) * plotH;
    }

    chartCtx.strokeStyle = "#e2e2e2";
    chartCtx.lineWidth = 1;
    for (var yi = 0; yi <= yTicks; yi++) {
      var value = minVal + ((maxVal - minVal) * yi) / yTicks;
      var y = yFor(value);
      chartCtx.beginPath();
      chartCtx.moveTo(pad.left, y);
      chartCtx.lineTo(pad.left + plotW, y);
      chartCtx.stroke();
      chartCtx.fillStyle = "#666";
      chartCtx.font = "12px Verdana, sans-serif";
      chartCtx.textAlign = "right";
      chartCtx.textBaseline = "middle";
      chartCtx.fillText(money.format(value), pad.left - 8, y);
    }

    var xTickCount = Math.min(6, maxYear);
    for (var t = 0; t <= xTickCount; t++) {
      var year = Math.round((maxYear * t) / xTickCount);
      var x = xFor(year);
      chartCtx.strokeStyle = "#eeeeee";
      chartCtx.beginPath();
      chartCtx.moveTo(x, pad.top);
      chartCtx.lineTo(x, pad.top + plotH);
      chartCtx.stroke();
      chartCtx.fillStyle = "#666";
      chartCtx.textAlign = "center";
      chartCtx.textBaseline = "top";
      chartCtx.fillText(String(year), x, pad.top + plotH + 8);
    }

    chartCtx.strokeStyle = "#999";
    chartCtx.beginPath();
    chartCtx.moveTo(pad.left, pad.top);
    chartCtx.lineTo(pad.left, pad.top + plotH);
    chartCtx.lineTo(pad.left + plotW, pad.top + plotH);
    chartCtx.stroke();

    var colors = ["#2660ab", "#b85c38"];
    var endLabels = [];
    seriesList.forEach(function (series, index) {
      var color = series.color || colors[index % colors.length];
      chartCtx.strokeStyle = color;
      chartCtx.lineWidth = 2.25;
      chartCtx.beginPath();
      series.points.forEach(function (point, pi) {
        var px = xFor(point.year);
        var py = yFor(point.value);
        if (pi === 0) {
          chartCtx.moveTo(px, py);
        } else {
          chartCtx.lineTo(px, py);
        }
      });
      chartCtx.stroke();

      var last = series.points[series.points.length - 1];
      if (last) {
        chartCtx.fillStyle = color;
        chartCtx.beginPath();
        chartCtx.arc(xFor(last.year), yFor(last.value), 3.5, 0, Math.PI * 2);
        chartCtx.fill();
        endLabels.push({
          text: money.format(last.value),
          x: xFor(last.year) - 4,
          y: yFor(last.value) - 6,
          color: color,
        });
      }
    });

    // Offset overlapping end labels vertically.
    endLabels.sort(function (a, b) {
      return a.y - b.y;
    });
    for (var li = 1; li < endLabels.length; li++) {
      if (endLabels[li].y - endLabels[li - 1].y < 14) {
        endLabels[li].y = endLabels[li - 1].y + 14;
      }
    }
    endLabels.forEach(function (label) {
      chartCtx.fillStyle = label.color;
      chartCtx.font = "12px Verdana, sans-serif";
      chartCtx.textAlign = "right";
      chartCtx.textBaseline = "bottom";
      chartCtx.fillText(label.text, label.x, label.y);
    });

    if (options && options.legend && options.legend.length) {
      var legendX = pad.left + 8;
      var legendY = pad.top + 8;
      options.legend.forEach(function (item, index) {
        var color = item.color || colors[index % colors.length];
        chartCtx.fillStyle = color;
        chartCtx.fillRect(legendX, legendY + index * 18, 12, 12);
        chartCtx.fillStyle = "#333";
        chartCtx.font = "12px Verdana, sans-serif";
        chartCtx.textAlign = "left";
        chartCtx.textBaseline = "middle";
        chartCtx.fillText(item.label, legendX + 18, legendY + index * 18 + 6);
      });
    }
  }

  function computeGrowth() {
    var principal = parseNumber(document.getElementById("irGrowthPrincipal"), NaN);
    var rate = parseNumber(document.getElementById("irGrowthRate"), NaN);
    var yearsResult = utils.parseYears(document.getElementById("irGrowthYears").value);
    if (yearsResult.error) {
      return { error: yearsResult.error };
    }
    var years = yearsResult.value;
    var compound = document.getElementById("irGrowthCompound").value;
    var err = utils.validateCommon(principal, rate, years);
    if (err) {
      return { error: err };
    }
    var points = utils.seriesCompound(principal, rate, years, compound);
    var finiteErr = utils.assertFiniteSeries(points);
    if (finiteErr) {
      return { error: finiteErr };
    }
    var ending = points[points.length - 1].value;
    var gained = ending - principal;
    return {
      error: null,
      title: "Growth",
      subtitle:
        money.format(principal) +
        " @ " +
        pct.format(rate) +
        "% for " +
        years +
        " years (" +
        compound +
        ")",
      principal: principal,
      ending: ending,
      gained: gained,
      years: years,
      series: [{ label: "Balance", color: "#2660ab", points: points }],
      summaryItems: [
        { label: "Starting", value: moneyExact.format(principal) },
        { label: "Ending", value: moneyExact.format(ending) },
        { label: "Gained", value: moneyExact.format(gained) },
      ],
    };
  }

  function computeCompare() {
    var principal = parseNumber(document.getElementById("irComparePrincipal"), NaN);
    var rate = parseNumber(document.getElementById("irCompareRate"), NaN);
    var yearsResult = utils.parseYears(document.getElementById("irCompareYears").value);
    if (yearsResult.error) {
      return { error: yearsResult.error };
    }
    var years = yearsResult.value;
    var err = utils.validateCommon(principal, rate, years);
    if (err) {
      return { error: err };
    }
    var simplePoints = utils.seriesSimple(principal, rate, years);
    var compoundPoints = utils.seriesCompound(principal, rate, years, "yearly");
    var finiteErr =
      utils.assertFiniteSeries(simplePoints) || utils.assertFiniteSeries(compoundPoints);
    if (finiteErr) {
      return { error: finiteErr };
    }
    var simpleEnd = simplePoints[simplePoints.length - 1].value;
    var compoundEnd = compoundPoints[compoundPoints.length - 1].value;
    var delta = compoundEnd - simpleEnd;
    return {
      error: null,
      title: "Simple vs compound",
      subtitle:
        money.format(principal) +
        " @ " +
        pct.format(rate) +
        "% for " +
        years +
        " years",
      principal: principal,
      ending: compoundEnd,
      gained: compoundEnd - principal,
      years: years,
      series: [
        { label: "Simple", color: "#b85c38", points: simplePoints },
        { label: "Compound (yearly)", color: "#2660ab", points: compoundPoints },
      ],
      legend: [
        { label: "Simple", color: "#b85c38" },
        { label: "Compound (yearly)", color: "#2660ab" },
      ],
      summaryItems: [
        { label: "Simple ending", value: moneyExact.format(simpleEnd) },
        { label: "Compound ending", value: moneyExact.format(compoundEnd) },
        { label: "Compound advantage", value: moneyExact.format(delta) },
      ],
    };
  }

  function computeSavings() {
    var principal = parseNumber(document.getElementById("irSavingsPrincipal"), NaN);
    var apr = parseNumber(document.getElementById("irSavingsApr"), NaN);
    var yearsResult = utils.parseYears(document.getElementById("irSavingsYears").value);
    if (yearsResult.error) {
      return { error: yearsResult.error };
    }
    var years = yearsResult.value;
    var compound = document.getElementById("irSavingsCompound").value;
    var err = utils.validateCommon(principal, apr, years);
    if (err) {
      return { error: err };
    }
    var points = utils.seriesCompound(principal, apr, years, compound);
    var finiteErr = utils.assertFiniteSeries(points);
    if (finiteErr) {
      return { error: finiteErr };
    }
    var year1 = utils.futureValue(principal, apr, 1, compound);
    var year1Interest = year1 - principal;
    var ending = points[points.length - 1].value;
    var apy = utils.apyFromApr(apr, compound);
    return {
      error: null,
      title: "Savings APR",
      subtitle:
        money.format(principal) +
        " @ " +
        pct.format(apr) +
        "% APR (" +
        compound +
        ") for " +
        years +
        " years",
      principal: principal,
      ending: ending,
      gained: ending - principal,
      years: years,
      series: [{ label: "Balance", color: "#2660ab", points: points }],
      summaryItems: [
        { label: "Year-1 interest", value: moneyExact.format(year1Interest) },
        { label: "Effective APY", value: pct.format(apy * 100) + "%" },
        { label: "Ending", value: moneyExact.format(ending) },
        { label: "Total gained", value: moneyExact.format(ending - principal) },
      ],
    };
  }

  function computeStepped() {
    var principal = parseNumber(document.getElementById("irSteppedPrincipal"), NaN);
    var stepped = utils.seriesStepped(principal, readPeriods());
    if (stepped.error) {
      return { error: stepped.error };
    }
    var ending = stepped.points[stepped.points.length - 1].value;
    var rateLabel = stepped.periods
      .map(function (p) {
        return p.start + "–" + p.end + ": " + pct.format(p.rate) + "%";
      })
      .join("; ");
    return {
      error: null,
      title: "Stepped rates",
      subtitle: money.format(principal) + " — " + rateLabel,
      principal: principal,
      ending: ending,
      gained: ending - principal,
      years: stepped.maxYear,
      series: [{ label: "Balance", color: "#2660ab", points: stepped.points }],
      summaryItems: [
        { label: "Starting", value: moneyExact.format(principal) },
        { label: "Ending", value: moneyExact.format(ending) },
        { label: "Gained", value: moneyExact.format(ending - principal) },
        { label: "Years", value: String(stepped.maxYear) },
      ],
    };
  }

  function compute() {
    switch (currentMode) {
      case "compare":
        return computeCompare();
      case "savings":
        return computeSavings();
      case "stepped":
        return computeStepped();
      default:
        return computeGrowth();
    }
  }

  function refresh() {
    var result = compute();
    lastResult = result;
    if (result.error) {
      setStatus(result.error, true);
      summaryEl.textContent = "";
      drawChart([], {});
      return;
    }
    setStatus("");
    renderSummary(result.summaryItems);
    drawChart(result.series, { legend: result.legend });
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refresh, 80);
  }

  function setMode(mode, options) {
    options = options || {};
    currentMode = mode;
    modeButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-mode") === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.tabIndex = active ? 0 : -1;
    });
    panels.forEach(function (panel) {
      var active = panel.getAttribute("data-panel") === mode;
      panel.classList.toggle("is-active", active);
      if (active) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
    refresh();
    if (options.focusTab) {
      var activeBtn = root.querySelector('.tool-mode[data-mode="' + mode + '"]');
      if (activeBtn) {
        activeBtn.focus();
      }
    }
  }

  function moveMode(delta) {
    var modes = modeButtons.map(function (btn) {
      return btn.getAttribute("data-mode");
    });
    var index = modes.indexOf(currentMode);
    if (index < 0) {
      index = 0;
    }
    var next = (index + delta + modes.length) % modes.length;
    setMode(modes[next], { focusTab: true });
  }

  function resetToDefaults() {
    document.getElementById("irGrowthPrincipal").value = DEFAULTS.growth.principal;
    document.getElementById("irGrowthRate").value = DEFAULTS.growth.rate;
    document.getElementById("irGrowthYears").value = DEFAULTS.growth.years;
    document.getElementById("irGrowthCompound").value = DEFAULTS.growth.compound;

    document.getElementById("irComparePrincipal").value = DEFAULTS.compare.principal;
    document.getElementById("irCompareRate").value = DEFAULTS.compare.rate;
    document.getElementById("irCompareYears").value = DEFAULTS.compare.years;

    document.getElementById("irSavingsPrincipal").value = DEFAULTS.savings.principal;
    document.getElementById("irSavingsApr").value = DEFAULTS.savings.apr;
    document.getElementById("irSavingsYears").value = DEFAULTS.savings.years;
    document.getElementById("irSavingsCompound").value = DEFAULTS.savings.compound;

    document.getElementById("irSteppedPrincipal").value = DEFAULTS.stepped.principal;
    renderPeriods(
      DEFAULTS.stepped.periods.map(function (p) {
        return { start: p.start, end: p.end, rate: p.rate };
      })
    );
    refresh();
  }

  function composeShareImage() {
    if (!lastResult || lastResult.error) {
      return null;
    }

    var exportWidth = 900;
    var footerHeight = 28;
    var chartWidth = chartCanvas.clientWidth || 720;
    var chartHeight = Math.max(260, Math.round(chartWidth * 0.5));
    var scale = exportWidth / chartWidth;

    var measureCanvas = document.createElement("canvas");
    var measureCtx = measureCanvas.getContext("2d");
    function measure(font, text) {
      measureCtx.font = font;
      return measureCtx.measureText(text).width;
    }

    var subtitleLines = utils.wrapTextLines(
      function (text) {
        return measure("16px Verdana, sans-serif", text);
      },
      lastResult.subtitle,
      exportWidth - 56
    );
    var metricsLine =
      "Start " +
      money.format(lastResult.principal) +
      "   ·   End " +
      money.format(lastResult.ending) +
      "   ·   Gained " +
      money.format(lastResult.gained);

    var headerHeight = 22 + 28 + subtitleLines.length * 20 + 12 + 22 + 16;
    var exportHeight = Math.round(headerHeight + chartHeight * scale + footerHeight);

    var out = document.createElement("canvas");
    out.width = exportWidth;
    out.height = exportHeight;
    var ctx = out.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    var y = 22;
    ctx.fillStyle = "#222";
    ctx.font = "bold 28px Verdana, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(lastResult.title, 28, y);
    y += 36;

    ctx.fillStyle = "#555";
    ctx.font = "16px Verdana, sans-serif";
    subtitleLines.forEach(function (line) {
      ctx.fillText(line, 28, y);
      y += 20;
    });
    y += 10;

    ctx.fillStyle = "#222";
    ctx.font = "bold 18px Verdana, sans-serif";
    ctx.fillText(metricsLine, 28, y);
    y += 28;

    var chartTop = y;
    ctx.drawImage(
      chartCanvas,
      0,
      chartTop,
      exportWidth,
      Math.round(chartHeight * scale)
    );

    ctx.fillStyle = "#888";
    ctx.font = "12px Verdana, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "garrypolley.com/tool/interest-return/",
      exportWidth - 20,
      exportHeight - footerHeight / 2
    );

    return out;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas.toBlob) {
        reject(new Error("PNG export is not supported in this browser."));
        return;
      }
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("Could not create PNG."));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function copyChart() {
    var share = composeShareImage();
    if (!share) {
      setStatus("Enter valid numbers before copying the chart.", true);
      return;
    }
    try {
      var blob = await canvasToBlob(share);
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatus("Chart copied. Paste it into a message or note.");
        return;
      }
      downloadBlob(blob, "interest-return.png");
      setStatus("Clipboard image copy is unavailable here — downloaded PNG instead.");
    } catch (err) {
      try {
        var fallback = await canvasToBlob(share);
        downloadBlob(fallback, "interest-return.png");
        setStatus("Could not copy — downloaded PNG instead.");
      } catch (err2) {
        setStatus("Could not export the chart.", true);
      }
    }
  }

  async function downloadChart() {
    var share = composeShareImage();
    if (!share) {
      setStatus("Enter valid numbers before downloading the chart.", true);
      return;
    }
    try {
      var blob = await canvasToBlob(share);
      downloadBlob(blob, "interest-return.png");
      setStatus("Downloaded interest-return.png");
    } catch (err) {
      setStatus("Could not download the chart.", true);
    }
  }

  modeButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setMode(btn.getAttribute("data-mode"));
    });
    btn.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveMode(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveMode(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        setMode(modeButtons[0].getAttribute("data-mode"), { focusTab: true });
      } else if (event.key === "End") {
        event.preventDefault();
        setMode(
          modeButtons[modeButtons.length - 1].getAttribute("data-mode"),
          { focusTab: true }
        );
      }
    });
  });

  root.addEventListener("input", function () {
    scheduleRefresh();
  });
  root.addEventListener("change", function () {
    scheduleRefresh();
  });

  periodsEl.addEventListener("click", function (event) {
    var removeBtn = event.target.closest(".tool-period-remove");
    if (!removeBtn) {
      return;
    }
    var periods = readPeriods();
    var index = parseInt(removeBtn.getAttribute("data-index"), 10);
    if (periods.length <= 1) {
      setStatus("Keep at least one rate period.", true);
      return;
    }
    periods.splice(index, 1);
    renderPeriods(periods);
    refresh();
  });

  document.getElementById("irAddPeriod").addEventListener("click", function () {
    var periods = readPeriods();
    var lastEnd = 0;
    periods.forEach(function (p) {
      if (p.end > lastEnd) {
        lastEnd = p.end;
      }
    });
    var start = lastEnd + 1;
    if (start > utils.MAX_YEARS) {
      setStatus("Cannot add a period past year 100.", true);
      return;
    }
    periods.push({
      start: start,
      end: Math.min(utils.MAX_YEARS, start + 4),
      rate: 5,
    });
    renderPeriods(periods);
    refresh();
  });

  document.getElementById("irCopyChart").addEventListener("click", function () {
    copyChart();
  });
  document.getElementById("irDownloadChart").addEventListener("click", function () {
    downloadChart();
  });
  document.getElementById("irReset").addEventListener("click", function () {
    resetToDefaults();
    setStatus("Reset to sample values.");
  });

  window.addEventListener("resize", scheduleRefresh);

  // Wire max attributes from utils.
  ["irGrowthPrincipal", "irComparePrincipal", "irSavingsPrincipal", "irSteppedPrincipal"].forEach(
    function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.max = String(utils.MAX_PRINCIPAL);
      }
    }
  );
  ["irGrowthRate", "irCompareRate", "irSavingsApr"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.max = String(utils.MAX_RATE);
    }
  });

  renderPeriods(
    DEFAULTS.stepped.periods.map(function (p) {
      return { start: p.start, end: p.end, rate: p.rate };
    })
  );
  setMode("growth");
})();
