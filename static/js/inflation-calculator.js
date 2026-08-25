(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InflationCalculator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function roundMoney(n) {
    return Math.round(n * 100) / 100;
  }

  function formatMoney(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Convert dollars from one CPI year to another.
   * result = amount * (cpiTo / cpiFrom)
   */
  function convert(amount, cpiFrom, cpiTo) {
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "Enter a non-negative dollar amount." };
    }
    if (!Number.isFinite(cpiFrom) || cpiFrom <= 0 || !Number.isFinite(cpiTo) || cpiTo <= 0) {
      return { ok: false, error: "Missing CPI index for one of the selected years." };
    }
    var value = roundMoney(amount * (cpiTo / cpiFrom));
    return {
      ok: true,
      value: value,
      factor: cpiTo / cpiFrom,
    };
  }

  function yearsBetween(fromYear, toYear) {
    var start = Math.min(fromYear, toYear);
    var end = Math.max(fromYear, toYear);
    var years = [];
    for (var y = start; y <= end; y += 1) years.push(y);
    return years;
  }

  /**
   * Map a chart X (CSS pixels) to the nearest series index.
   * Points are spaced evenly across [padLeft, padLeft + plotWidth].
   */
  function nearestIndex(x, length, padLeft, plotWidth) {
    if (!Number.isFinite(length) || length <= 1) return 0;
    if (!Number.isFinite(plotWidth) || plotWidth <= 0) return 0;
    var t = (x - padLeft) / plotWidth;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.round(t * (length - 1));
  }

  /**
   * Series of equivalent values for each year between from and to,
   * using the from-year amount as the baseline.
   */
  function series(amount, fromYear, toYear, annual) {
    if (!annual || typeof annual !== "object") {
      return { ok: false, error: "CPI data is not loaded." };
    }
    var cpiFrom = annual[fromYear];
    if (!Number.isFinite(cpiFrom)) {
      return { ok: false, error: "No CPI data for " + fromYear + "." };
    }

    var years = yearsBetween(fromYear, toYear);
    var rows = [];
    for (var i = 0; i < years.length; i += 1) {
      var year = years[i];
      var cpi = annual[year];
      if (!Number.isFinite(cpi)) continue;
      var converted = convert(amount, cpiFrom, cpi);
      if (!converted.ok) continue;
      rows.push({
        year: year,
        cpi: cpi,
        value: converted.value,
        factor: converted.factor,
      });
    }

    if (rows.length === 0) {
      return { ok: false, error: "No overlapping CPI years in that range." };
    }

    return { ok: true, fromYear: fromYear, toYear: toYear, amount: amount, rows: rows };
  }

  function parseCpiPayload(payload) {
    if (!payload || typeof payload !== "object" || !payload.annual) {
      throw new Error("Invalid CPI payload");
    }
    var annual = {};
    var keys = Object.keys(payload.annual);
    for (var i = 0; i < keys.length; i += 1) {
      var year = Number(keys[i]);
      var value = Number(payload.annual[keys[i]]);
      if (Number.isFinite(year) && Number.isFinite(value)) {
        annual[year] = value;
      }
    }
    var years = Object.keys(annual)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    return {
      source: payload.source || "U.S. Bureau of Labor Statistics",
      seriesId: payload.seriesId || "CUUR0000SA0",
      seriesTitle: payload.seriesTitle || "",
      indexBase: payload.indexBase || payload.unit || "1982-84=100",
      fetchedAt: payload.fetchedAt || "",
      note: payload.note || "",
      annual: annual,
      years: years,
      minYear: years[0],
      maxYear: years[years.length - 1],
    };
  }

  return {
    convert: convert,
    series: series,
    yearsBetween: yearsBetween,
    nearestIndex: nearestIndex,
    formatMoney: formatMoney,
    roundMoney: roundMoney,
    parseCpiPayload: parseCpiPayload,
  };
});

(function () {
  if (typeof document === "undefined") return;

  var root = document.getElementById("inflationCalculatorTool");
  if (!root) return;

  var utils = typeof InflationCalculator !== "undefined" ? InflationCalculator : null;
  if (!utils) return;

  var amountEl = document.getElementById("icAmount");
  var fromYearEl = document.getElementById("icFromYear");
  var toYearEl = document.getElementById("icToYear");
  var statusEl = document.getElementById("icStatus");
  var summaryEl = document.getElementById("icSummary");
  var tableWrap = document.getElementById("icTableWrap");
  var tableBody = document.getElementById("icTableBody");
  var chartCanvas = document.getElementById("icChart");
  var chartReadoutEl = document.getElementById("icChartReadout");
  var chartAnnounceEl = document.getElementById("icChartAnnounce");
  var metaEl = document.getElementById("icMeta");
  var resetBtn = document.getElementById("icReset");

  var cpi = null;
  var DEFAULT_AMOUNT = 60;
  var DEFAULT_FROM = 1913;
  var chartState = null;
  var scrubIndex = null;
  var isPointerDown = false;

  function setStatus(msg, isError) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function fillYearSelect(select, years, selected) {
    select.innerHTML = "";
    for (var i = 0; i < years.length; i += 1) {
      var y = years[i];
      var opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === selected) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function formatScrubText(row) {
    return row.year + ": " + utils.formatMoney(row.value) + " (CPI-U " + row.cpi.toFixed(3) + ")";
  }

  function setChartReadout(row, announce) {
    if (chartReadoutEl) {
      if (!row) {
        chartReadoutEl.textContent = "";
        chartReadoutEl.hidden = true;
      } else {
        chartReadoutEl.hidden = false;
        chartReadoutEl.textContent = formatScrubText(row);
      }
    }
    if (announce && chartAnnounceEl) {
      chartAnnounceEl.textContent = row ? formatScrubText(row) : "";
    }
  }

  function ensureCanvasContext() {
    if (!chartCanvas || !chartState) return null;
    var dpr = window.devicePixelRatio || 1;
    var tw = Math.round(chartState.cssW * dpr);
    var th = Math.round(chartState.cssH * dpr);
    if (chartCanvas.width !== tw || chartCanvas.height !== th) {
      chartCanvas.width = tw;
      chartCanvas.height = th;
    }
    var ctx = chartCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function paintChart() {
    if (!chartCanvas || !chartState) return;
    var ctx = ensureCanvasContext();
    if (!ctx) return;

    var rows = chartState.rows;
    var pad = chartState.pad;
    var cssW = chartState.cssW;
    var cssH = chartState.cssH;
    var w = chartState.w;
    var h = chartState.h;
    var minV = chartState.minV;
    var maxV = chartState.maxV;

    function xAt(idx) {
      if (rows.length === 1) return pad.left + w / 2;
      return pad.left + (idx / (rows.length - 1)) * w;
    }
    function yAt(v) {
      return pad.top + h - ((v - minV) / (maxV - minV)) * h;
    }

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    for (var g = 0; g < 4; g += 1) {
      var gy = pad.top + (h * g) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(pad.left + w, gy);
      ctx.stroke();
      var gv = maxV - ((maxV - minV) * g) / 3;
      ctx.fillStyle = "#666";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(utils.formatMoney(gv), pad.left - 8, gy);
    }

    ctx.beginPath();
    ctx.strokeStyle = "#1a5f7a";
    ctx.lineWidth = 2;
    for (var j = 0; j < rows.length; j += 1) {
      var x = xAt(j);
      var y = yAt(rows[j].value);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = "#1a5f7a";
    var first = rows[0];
    var last = rows[rows.length - 1];
    [[0, first], [rows.length - 1, last]].forEach(function (pair) {
      var px = xAt(pair[0]);
      var py = yAt(pair[1].value);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#444";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(first.year), pad.left, pad.top + h + 10);
    ctx.textAlign = "right";
    ctx.fillText(String(last.year), pad.left + w, pad.top + h + 10);

    if (scrubIndex == null || scrubIndex < 0 || scrubIndex >= rows.length) return;

    var row = rows[scrubIndex];
    var sx = xAt(scrubIndex);
    var sy = yAt(row.value);

    ctx.strokeStyle = "rgba(26, 95, 122, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, pad.top);
    ctx.lineTo(sx, pad.top + h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#1a5f7a";
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    var label = row.year + "  ·  " + utils.formatMoney(row.value);
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    var labelW = ctx.measureText(label).width;
    var boxPadX = 10;
    var boxW = labelW + boxPadX * 2;
    var boxH = 24;
    var boxX = sx - boxW / 2;
    var boxY = sy - boxH - 12;
    if (boxX < pad.left) boxX = pad.left;
    if (boxX + boxW > pad.left + w) boxX = pad.left + w - boxW;
    if (boxY < pad.top) boxY = sy + 12;

    ctx.fillStyle = "rgba(26, 95, 122, 0.95)";
    var r = 4;
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
    ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, boxX + boxPadX, boxY + boxH / 2);
  }

  function drawChart(rows) {
    if (!chartCanvas || !rows || rows.length === 0) {
      chartState = null;
      scrubIndex = null;
      setChartReadout(null, true);
      return;
    }

    var cssW = chartCanvas.clientWidth || 720;
    var cssH = 280;
    var pad = { top: 16, right: 16, bottom: 36, left: 64 };
    var w = cssW - pad.left - pad.right;
    var h = cssH - pad.top - pad.bottom;

    var minV = rows[0].value;
    var maxV = rows[0].value;
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].value < minV) minV = rows[i].value;
      if (rows[i].value > maxV) maxV = rows[i].value;
    }
    if (maxV === minV) {
      maxV = minV + 1;
      minV = Math.max(0, minV - 1);
    }
    var padY = (maxV - minV) * 0.08;
    minV = Math.max(0, minV - padY);
    maxV = maxV + padY;

    chartState = {
      rows: rows,
      pad: pad,
      cssW: cssW,
      cssH: cssH,
      w: w,
      h: h,
      minV: minV,
      maxV: maxV,
    };

    // Force bitmap resize when geometry changes (paint only reallocates if needed).
    ensureCanvasContext();

    if (scrubIndex != null && scrubIndex >= rows.length) {
      scrubIndex = rows.length - 1;
    }
    paintChart();
    if (scrubIndex != null) {
      setChartReadout(rows[scrubIndex], false);
    } else {
      setChartReadout(null, false);
    }
  }

  function pointerToIndex(clientX) {
    if (!chartState || !chartCanvas) return null;
    var rect = chartCanvas.getBoundingClientRect();
    var x = clientX - rect.left;
    return utils.nearestIndex(x, chartState.rows.length, chartState.pad.left, chartState.w);
  }

  function pointerInsideCanvas(clientX, clientY) {
    if (!chartCanvas) return false;
    var rect = chartCanvas.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function scrubTo(clientX) {
    if (!chartState) return;
    var idx = pointerToIndex(clientX);
    if (idx == null) return;
    if (idx === scrubIndex) return;
    scrubIndex = idx;
    paintChart();
    // Visual only while moving; announce on pointer-up / keyboard.
    setChartReadout(chartState.rows[idx], false);
  }

  function announceCurrentScrub() {
    if (scrubIndex == null || !chartState) {
      setChartReadout(null, true);
      return;
    }
    setChartReadout(chartState.rows[scrubIndex], true);
  }

  function clearScrub(announce) {
    if (scrubIndex == null) {
      if (announce) setChartReadout(null, true);
      return;
    }
    scrubIndex = null;
    paintChart();
    setChartReadout(null, !!announce);
  }

  function onChartPointerDown(evt) {
    if (!chartState) return;
    isPointerDown = true;
    if (chartCanvas.setPointerCapture) {
      try {
        chartCanvas.setPointerCapture(evt.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    scrubTo(evt.clientX);
    evt.preventDefault();
  }

  function onChartPointerMove(evt) {
    if (!chartState) return;
    if (evt.pointerType === "mouse" || isPointerDown) {
      scrubTo(evt.clientX);
    }
  }

  function onChartPointerUp(evt) {
    var wasDown = isPointerDown;
    isPointerDown = false;
    if (!wasDown && scrubIndex == null) return;

    if (evt.pointerType === "mouse" || evt.pointerType === "") {
      if (!pointerInsideCanvas(evt.clientX, evt.clientY)) {
        clearScrub(true);
        return;
      }
    }
    announceCurrentScrub();
  }

  function onChartLostPointerCapture() {
    isPointerDown = false;
  }

  function onChartPointerLeave() {
    if (!isPointerDown) clearScrub(true);
  }

  function onChartKeyDown(evt) {
    if (!chartState || !chartState.rows.length) return;
    var len = chartState.rows.length;
    var next = scrubIndex == null ? len - 1 : scrubIndex;
    if (evt.key === "ArrowLeft") {
      next = Math.max(0, next - 1);
    } else if (evt.key === "ArrowRight") {
      next = Math.min(len - 1, next + 1);
    } else if (evt.key === "Home") {
      next = 0;
    } else if (evt.key === "End") {
      next = len - 1;
    } else if (evt.key === "Escape") {
      clearScrub(true);
      return;
    } else {
      return;
    }
    evt.preventDefault();
    scrubIndex = next;
    paintChart();
    setChartReadout(chartState.rows[next], true);
  }

  function renderTable(rows) {
    tableBody.innerHTML = "";
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var tr = document.createElement("tr");
      if (i === 0 || i === rows.length - 1) tr.className = "is-endpoint";
      tr.innerHTML =
        "<td>" +
        row.year +
        "</td><td>" +
        utils.formatMoney(row.value) +
        "</td><td>" +
        row.cpi.toFixed(3) +
        "</td>";
      tableBody.appendChild(tr);
    }
    tableWrap.hidden = rows.length === 0;
    var caption = document.getElementById("icTableCaption");
    if (caption) {
      caption.textContent = "Equivalent value in each year (" + rows.length + " years).";
    }
  }

  function render() {
    if (!cpi) return;

    var amount = Number(amountEl.value);
    var fromYear = Number(fromYearEl.value);
    var toYear = Number(toYearEl.value);

    if (!Number.isFinite(amount) || amount < 0) {
      setStatus("Enter a non-negative dollar amount.", true);
      summaryEl.innerHTML = "";
      tableWrap.hidden = true;
      drawChart(null);
      return;
    }

    var result = utils.series(amount, fromYear, toYear, cpi.annual);
    if (!result.ok) {
      setStatus(result.error, true);
      summaryEl.innerHTML = "";
      tableWrap.hidden = true;
      drawChart(null);
      return;
    }

    setStatus("");
    var startRow = result.rows[0];
    var endRow = result.rows[result.rows.length - 1];
    // Prefer exact endpoint years when from > to (series is sorted ascending).
    var fromRow = null;
    var toRow = null;
    for (var i = 0; i < result.rows.length; i += 1) {
      if (result.rows[i].year === fromYear) fromRow = result.rows[i];
      if (result.rows[i].year === toYear) toRow = result.rows[i];
    }
    if (!fromRow) fromRow = startRow;
    if (!toRow) toRow = endRow;

    var mult = toRow.value / amount;
    var multText = Number.isFinite(mult)
      ? (mult >= 1 ? mult.toFixed(2) + "×" : (1 / mult).toFixed(2) + "× less")
      : "—";

    summaryEl.innerHTML =
      '<div class="tool-summary-item"><div class="tool-summary-label">Then</div>' +
      '<div class="tool-summary-value">' +
      utils.formatMoney(amount) +
      " in " +
      fromYear +
      "</div></div>" +
      '<div class="tool-summary-item"><div class="tool-summary-label">In ' +
      toYear +
      '</div><div class="tool-summary-value">' +
      utils.formatMoney(toRow.value) +
      "</div></div>" +
      '<div class="tool-summary-item"><div class="tool-summary-label">Change</div>' +
      '<div class="tool-summary-value">' +
      multText +
      "</div></div>";

    renderTable(result.rows);
    drawChart(result.rows);
  }

  function resetDefaults() {
    if (!cpi) return;
    amountEl.value = String(DEFAULT_AMOUNT);
    var from = cpi.years.indexOf(DEFAULT_FROM) >= 0 ? DEFAULT_FROM : cpi.minYear;
    fillYearSelect(fromYearEl, cpi.years, from);
    fillYearSelect(toYearEl, cpi.years, cpi.maxYear);
    render();
  }

  function onInputs() {
    render();
  }

  amountEl.addEventListener("input", onInputs);
  fromYearEl.addEventListener("change", onInputs);
  toYearEl.addEventListener("change", onInputs);
  resetBtn.addEventListener("click", resetDefaults);
  window.addEventListener("resize", function () {
    if (cpi) render();
  });

  if (chartCanvas) {
    chartCanvas.style.touchAction = "none";
    chartCanvas.addEventListener("pointerdown", onChartPointerDown);
    chartCanvas.addEventListener("pointermove", onChartPointerMove);
    chartCanvas.addEventListener("pointerup", onChartPointerUp);
    chartCanvas.addEventListener("pointercancel", function () {
      isPointerDown = false;
    });
    chartCanvas.addEventListener("lostpointercapture", onChartLostPointerCapture);
    chartCanvas.addEventListener("pointerleave", onChartPointerLeave);
    chartCanvas.addEventListener("keydown", onChartKeyDown);
  }

  setStatus("Loading BLS CPI data…");

  fetch("/data/cpi-u-annual.json")
    .then(function (res) {
      if (!res.ok) throw new Error("Could not load CPI data (" + res.status + ").");
      return res.json();
    })
    .then(function (payload) {
      cpi = utils.parseCpiPayload(payload);
      metaEl.textContent =
        "Source: " +
        cpi.source +
        " series " +
        cpi.seriesId +
        " (annual averages, " +
        cpi.minYear +
        "–" +
        cpi.maxYear +
        "). Index base " +
        cpi.indexBase +
        ". Data fetched " +
        (cpi.fetchedAt || "—") +
        ". Official annual CPI starts in 1913.";
      resetDefaults();
    })
    .catch(function (err) {
      setStatus(err && err.message ? err.message : "Failed to load CPI data.", true);
    });
})();
