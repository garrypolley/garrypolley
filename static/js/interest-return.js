(function () {
  var root = document.getElementById("interestReturnTool");
  if (!root) {
    return;
  }

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

  var modeButtons = root.querySelectorAll(".tool-mode");
  var panels = root.querySelectorAll(".tool-panel");
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

  function parseNumber(el, fallback) {
    var value = parseFloat(el.value);
    if (!isFinite(value)) {
      return fallback;
    }
    return value;
  }

  function parseIntSafe(el, fallback) {
    var value = parseInt(el.value, 10);
    if (!isFinite(value)) {
      return fallback;
    }
    return value;
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function validateCommon(principal, rate, years) {
    if (!(principal >= 0)) {
      return "Principal must be zero or greater.";
    }
    if (!(rate >= 0)) {
      return "Rate must be zero or greater.";
    }
    if (!(years >= 1) || years > 100) {
      return "Years must be between 1 and 100.";
    }
    return null;
  }

  function renderPeriods(periods) {
    periodsEl.innerHTML = "";
    periods.forEach(function (period, index) {
      var row = document.createElement("div");
      row.className = "tool-period-row";
      row.innerHTML =
        '<div class="tool-field tool-field--inline">' +
        '<label>From year</label>' +
        '<input type="number" min="1" max="100" step="1" data-field="start" value="' +
        period.start +
        '" />' +
        '<label>To year</label>' +
        '<input type="number" min="1" max="100" step="1" data-field="end" value="' +
        period.end +
        '" />' +
        '<label>Rate (%)</label>' +
        '<input type="number" min="0" step="0.1" data-field="rate" value="' +
        period.rate +
        '" />' +
        '<button type="button" class="tool-button--secondary tool-period-remove" data-index="' +
        index +
        '" aria-label="Remove period">Remove</button>' +
        "</div>";
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

  function seriesStepped(principal, periods) {
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
      if (p.start < 1 || p.end < p.start || p.end > 100) {
        return {
          error: "Each period needs From year ≤ To year (1–100).",
          points: [],
        };
      }
      if (p.rate < 0) {
        return { error: "Rates must be zero or greater.", points: [] };
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
      points.push({ year: year, value: balance });
    }
    return { error: null, points: points, periods: sorted, maxYear: maxYear };
  }

  function summaryItem(label, value) {
    return (
      '<div class="tool-summary-item">' +
      '<span class="tool-summary-label">' +
      label +
      "</span>" +
      '<span class="tool-summary-value">' +
      value +
      "</span></div>"
    );
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
    var pad = { top: 16, right: 16, bottom: 36, left: 64 };
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;

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
    // Give a little headroom above the top value.
    var range = maxVal - minVal;
    minVal = Math.max(0, minVal - range * 0.05);
    maxVal = maxVal + range * 0.08;

    function xFor(year) {
      return pad.left + (year / maxYear) * plotW;
    }
    function yFor(value) {
      return pad.top + plotH - ((value - minVal) / (maxVal - minVal)) * plotH;
    }

    // Grid + axes
    chartCtx.strokeStyle = "#e2e2e2";
    chartCtx.lineWidth = 1;
    var yTicks = 4;
    for (var i = 0; i <= yTicks; i++) {
      var value = minVal + ((maxVal - minVal) * i) / yTicks;
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
        chartCtx.font = "12px Verdana, sans-serif";
        chartCtx.textAlign = "right";
        chartCtx.textBaseline = "bottom";
        chartCtx.fillText(money.format(last.value), xFor(last.year) - 4, yFor(last.value) - 6);
      }
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
    var years = parseIntSafe(document.getElementById("irGrowthYears"), NaN);
    var compound = document.getElementById("irGrowthCompound").value;
    var err = validateCommon(principal, rate, years);
    if (err) {
      return { error: err };
    }
    var points = seriesCompound(principal, rate, years, compound);
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
      summaryHtml:
        summaryItem("Starting", moneyExact.format(principal)) +
        summaryItem("Ending", moneyExact.format(ending)) +
        summaryItem("Gained", moneyExact.format(gained)),
    };
  }

  function computeCompare() {
    var principal = parseNumber(document.getElementById("irComparePrincipal"), NaN);
    var rate = parseNumber(document.getElementById("irCompareRate"), NaN);
    var years = parseIntSafe(document.getElementById("irCompareYears"), NaN);
    var err = validateCommon(principal, rate, years);
    if (err) {
      return { error: err };
    }
    var simplePoints = seriesSimple(principal, rate, years);
    var compoundPoints = seriesCompound(principal, rate, years, "yearly");
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
      summaryHtml:
        summaryItem("Simple ending", moneyExact.format(simpleEnd)) +
        summaryItem("Compound ending", moneyExact.format(compoundEnd)) +
        summaryItem("Compound advantage", moneyExact.format(delta)),
    };
  }

  function computeSavings() {
    var principal = parseNumber(document.getElementById("irSavingsPrincipal"), NaN);
    var apr = parseNumber(document.getElementById("irSavingsApr"), NaN);
    var years = parseIntSafe(document.getElementById("irSavingsYears"), NaN);
    var compound = document.getElementById("irSavingsCompound").value;
    var err = validateCommon(principal, apr, years);
    if (err) {
      return { error: err };
    }
    var points = seriesCompound(principal, apr, years, compound);
    var year1 = futureValue(principal, apr, 1, compound);
    var year1Interest = year1 - principal;
    var ending = points[points.length - 1].value;
    var apy = apyFromApr(apr, compound);
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
      summaryHtml:
        summaryItem("Year-1 interest", moneyExact.format(year1Interest)) +
        summaryItem("Effective APY", pct.format(apy * 100) + "%") +
        summaryItem("Ending", moneyExact.format(ending)) +
        summaryItem("Total gained", moneyExact.format(ending - principal)),
    };
  }

  function computeStepped() {
    var principal = parseNumber(document.getElementById("irSteppedPrincipal"), NaN);
    if (!(principal >= 0)) {
      return { error: "Principal must be zero or greater." };
    }
    var stepped = seriesStepped(principal, readPeriods());
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
      summaryHtml:
        summaryItem("Starting", moneyExact.format(principal)) +
        summaryItem("Ending", moneyExact.format(ending)) +
        summaryItem("Gained", moneyExact.format(ending - principal)) +
        summaryItem("Years", String(stepped.maxYear)),
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
      summaryEl.innerHTML = "";
      drawChart([], {});
      return;
    }
    setStatus("");
    summaryEl.innerHTML = result.summaryHtml;
    drawChart(result.series, { legend: result.legend });
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refresh, 80);
  }

  function setMode(mode) {
    currentMode = mode;
    modeButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-mode") === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
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
    renderPeriods(DEFAULTS.stepped.periods.map(function (p) {
      return { start: p.start, end: p.end, rate: p.rate };
    }));
    refresh();
  }

  function composeShareImage() {
    if (!lastResult || lastResult.error) {
      return null;
    }

    var exportWidth = 900;
    var headerHeight = 118;
    var chartWidth = chartCanvas.clientWidth || 720;
    var chartHeight = Math.max(260, Math.round(chartWidth * 0.5));
    var scale = exportWidth / chartWidth;
    var exportHeight = Math.round(headerHeight + chartHeight * scale);

    var out = document.createElement("canvas");
    out.width = exportWidth;
    out.height = exportHeight;
    var ctx = out.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    ctx.fillStyle = "#222";
    ctx.font = "bold 28px Verdana, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(lastResult.title, 28, 22);

    ctx.fillStyle = "#555";
    ctx.font = "16px Verdana, sans-serif";
    wrapText(ctx, lastResult.subtitle, 28, 58, exportWidth - 56, 20);

    ctx.fillStyle = "#222";
    ctx.font = "bold 18px Verdana, sans-serif";
    var footerBits = [
      "Start " + money.format(lastResult.principal),
      "End " + money.format(lastResult.ending),
      "Gained " + money.format(lastResult.gained),
    ];
    ctx.fillText(footerBits.join("   ·   "), 28, 88);

    // Draw chart area into export (re-render at export scale via current canvas).
    ctx.drawImage(chartCanvas, 0, headerHeight, exportWidth, Math.round(chartHeight * scale));

    ctx.fillStyle = "#888";
    ctx.font = "12px Verdana, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("garrypolley.com/tool/interest-return/", exportWidth - 20, exportHeight - 18);

    return out;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = String(text).split(" ");
    var line = "";
    var lineY = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = words[i];
        lineY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, lineY);
    }
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
  });

  root.addEventListener("input", function (event) {
    if (event.target.closest("#interestReturnTool")) {
      scheduleRefresh();
    }
  });
  root.addEventListener("change", function (event) {
    if (event.target.closest("#interestReturnTool")) {
      scheduleRefresh();
    }
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
    if (start > 100) {
      setStatus("Cannot add a period past year 100.", true);
      return;
    }
    periods.push({
      start: start,
      end: Math.min(100, start + 4),
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

  renderPeriods(
    DEFAULTS.stepped.periods.map(function (p) {
      return { start: p.start, end: p.end, rate: p.rate };
    })
  );
  refresh();
})();
