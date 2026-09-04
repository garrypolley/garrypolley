(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.K401Growth = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_BALANCE = 1e12;
  var MAX_RATE = 100;
  var MIN_YEARS = 1;
  var MAX_YEARS = 50;
  var MAX_LOAN_TERM = 15;

  // IRS 2026 figures (elective deferral / catch-up / §415 annual additions / loan cap).
  var LIMITS_2026 = {
    employee: 24500,
    catchup50: 8000,
    catchupSuper: 11250,
    annualAdditions: 72000,
    loanMax: 50000,
    loanPct: 50,
  };

  function roundMoney(n) {
    return Math.round(n * 100) / 100;
  }

  function formatMoney(n, digits) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits == null ? 0 : digits,
      maximumFractionDigits: digits == null ? 0 : digits,
    });
  }

  function employeeMax(ageBand) {
    if (ageBand === "super") return LIMITS_2026.employee + LIMITS_2026.catchupSuper;
    if (ageBand === "catchup") return LIMITS_2026.employee + LIMITS_2026.catchup50;
    return LIMITS_2026.employee;
  }

  /**
   * Employer match: matchRate% of employee deferrals, on the first matchCap% of salary.
   */
  function employerMatch(employeeAnnual, salary, matchRatePct, matchCapPct) {
    if (!Number.isFinite(employeeAnnual) || employeeAnnual <= 0) return 0;
    if (!Number.isFinite(salary) || salary <= 0) return 0;
    if (!Number.isFinite(matchRatePct) || matchRatePct <= 0) return 0;
    var capPct = Number.isFinite(matchCapPct) ? matchCapPct : 0;
    var eligible = capPct > 0 ? Math.min(employeeAnnual, salary * (capPct / 100)) : employeeAnnual;
    if (eligible <= 0) return 0;
    return roundMoney(eligible * (matchRatePct / 100));
  }

  /**
   * Fixed monthly payment that amortizes `principal` over `months` at `aprPct`.
   */
  function amortizingPayment(principal, aprPct, months) {
    if (!Number.isFinite(principal) || principal <= 0) return 0;
    if (!Number.isFinite(months) || months < 1) return 0;
    var n = Math.floor(months);
    var i = (Number(aprPct) || 0) / 100 / 12;
    if (i === 0) return principal / n;
    var factor = Math.pow(1 + i, n);
    return (principal * (i * factor)) / (factor - 1);
  }

  function nearestIndex(x, length, padLeft, plotWidth) {
    if (!Number.isFinite(length) || length <= 1) return 0;
    if (!Number.isFinite(plotWidth) || plotWidth <= 0) return 0;
    var t = (x - padLeft) / plotWidth;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.round(t * (length - 1));
  }

  function validate(input) {
    if (!Number.isFinite(input.balance) || input.balance < 0) {
      return "Current balance must be zero or greater.";
    }
    if (input.balance > MAX_BALANCE) {
      return "Current balance is too large.";
    }
    if (!Number.isFinite(input.employeeAnnual) || input.employeeAnnual < 0) {
      return "Employee contribution must be zero or greater.";
    }
    if (!Number.isFinite(input.salary) || input.salary < 0) {
      return "Salary must be zero or greater.";
    }
    if (!Number.isFinite(input.matchRatePct) || input.matchRatePct < 0 || input.matchRatePct > MAX_RATE) {
      return "Match rate must be between 0 and 100%.";
    }
    if (!Number.isFinite(input.matchCapPct) || input.matchCapPct < 0 || input.matchCapPct > MAX_RATE) {
      return "Match cap must be between 0 and 100% of salary.";
    }
    if (!Number.isFinite(input.returnPct) || input.returnPct < 0 || input.returnPct > MAX_RATE) {
      return "Expected return must be between 0 and 100%.";
    }
    if (!Number.isFinite(input.years) || input.years !== Math.floor(input.years) || input.years < MIN_YEARS || input.years > MAX_YEARS) {
      return "Years must be a whole number from 1 to " + MAX_YEARS + ".";
    }
    if (input.loanEnabled) {
      if (!Number.isFinite(input.loanAmount) || input.loanAmount < 0) {
        return "Loan amount must be zero or greater.";
      }
      if (!Number.isFinite(input.loanApr) || input.loanApr < 0 || input.loanApr > MAX_RATE) {
        return "Loan APR must be between 0 and 100%.";
      }
      if (!Number.isFinite(input.loanTermYears) || input.loanTermYears !== Math.floor(input.loanTermYears) || input.loanTermYears < 1 || input.loanTermYears > MAX_LOAN_TERM) {
        return "Loan term must be a whole number from 1 to " + MAX_LOAN_TERM + " years.";
      }
      if (!Number.isFinite(input.loanStartYear) || input.loanStartYear !== Math.floor(input.loanStartYear) || input.loanStartYear < 0 || input.loanStartYear >= input.years) {
        return "Loan start year must be from 0 (now) through " + (input.years - 1) + ".";
      }
      if (input.loanRepeat) {
        if (!Number.isFinite(input.loanRepeatYears) || input.loanRepeatYears !== Math.floor(input.loanRepeatYears) || input.loanRepeatYears < 1 || input.loanRepeatYears > MAX_YEARS) {
          return "Loan repeat interval must be a whole number from 1 to " + MAX_YEARS + " years.";
        }
      }
    }
    return null;
  }

  function snapshot(year, invested, loanRemaining) {
    return {
      year: year,
      value: roundMoney(invested),
      loanRemaining: roundMoney(loanRemaining || 0),
    };
  }

  /**
   * Monthly 401(k) simulation.
   * Contributions and (if enabled) loan payments land at month-end after market growth.
   * Loan interest is paid from outside the plan and deposited back into the invested balance.
   */
  function simulate(input) {
    var err = validate(input);
    if (err) return { ok: false, error: err };

    var employerAnnual = employerMatch(
      input.employeeAnnual,
      input.salary,
      input.matchRatePct,
      input.matchCapPct
    );
    var months = input.years * 12;
    var r = input.returnPct / 100 / 12;
    var empM = input.employeeAnnual / 12;
    var erM = employerAnnual / 12;

    var loanOn = !!input.loanEnabled && input.loanAmount > 0;
    var startMonth = loanOn ? input.loanStartYear * 12 : -1;
    var loanTermMonths = loanOn ? input.loanTermYears * 12 : 0;
    var repeatOn = loanOn && !!input.loanRepeat;
    var repeatMonths = repeatOn ? input.loanRepeatYears * 12 : 0;

    var noLoan = input.balance;
    var invested = input.balance;
    var loans = [];
    var interestPaid = 0;
    var principalRepaid = 0;
    var totalTaken = 0;
    var loanCount = 0;
    var reducedOrigination = false;
    var skippedOrigination = false;
    var overlapping = false;
    var capWarned = false;
    var warnings = [];
    var iLoan = (input.loanApr || 0) / 100 / 12;
    var standardPayment = loanOn ? amortizingPayment(input.loanAmount, input.loanApr, loanTermMonths) : 0;

    function outstanding() {
      var sum = 0;
      for (var i = 0; i < loans.length; i++) sum += loans[i].remaining;
      return sum;
    }

    function shouldOriginate(month) {
      if (!loanOn || month < startMonth) return false;
      if (!repeatOn) return month === startMonth;
      return (month - startMonth) % repeatMonths === 0;
    }

    function originate() {
      if (loans.length > 0) overlapping = true;
      var taken = Math.min(input.loanAmount, invested);
      if (taken <= 0.005) {
        skippedOrigination = true;
        return;
      }
      if (taken + 0.005 < input.loanAmount) reducedOrigination = true;
      var vested = invested + outstanding();
      var irsCap = Math.min(LIMITS_2026.loanMax, vested * (LIMITS_2026.loanPct / 100));
      if (!capWarned && (taken > irsCap + 0.005 || outstanding() + taken > irsCap + 0.005)) {
        capWarned = true;
        warnings.push(
          "Requested loan is above the typical IRS cap (lesser of 50% of the vested balance or $50,000). Plans vary; this is illustrative."
        );
      }
      loans.push({
        remaining: taken,
        payment: amortizingPayment(taken, input.loanApr, loanTermMonths),
        left: loanTermMonths,
      });
      invested -= taken;
      totalTaken += taken;
      loanCount += 1;
    }

    function payLoans() {
      for (var i = 0; i < loans.length; i++) {
        var loan = loans[i];
        if (loan.remaining <= 0 || loan.left <= 0) continue;
        var interest = loan.remaining * iLoan;
        var due = loan.left === 1 ? loan.remaining + interest : Math.min(loan.payment, loan.remaining + interest);
        if (due < 0) due = 0;
        var principalPay = Math.min(loan.remaining, Math.max(0, due - interest));
        var interestPay = due - principalPay;
        loan.remaining = roundMoney(loan.remaining - principalPay);
        if (loan.remaining < 0.005) loan.remaining = 0;
        invested += principalPay + interestPay;
        interestPaid += interestPay;
        principalRepaid += principalPay;
        loan.left -= 1;
      }
      loans = loans.filter(function (loan) {
        return loan.remaining > 0 && loan.left > 0;
      });
    }

    if (shouldOriginate(0)) originate();

    var pointsNo = [snapshot(0, noLoan, 0)];
    var pointsYes = [snapshot(0, invested, outstanding())];

    for (var m = 1; m <= months; m++) {
      noLoan = noLoan * (1 + r) + empM + erM;
      invested = invested * (1 + r) + empM + erM;
      payLoans();
      if (shouldOriginate(m) && m < months) originate();

      if (m % 12 === 0) {
        pointsNo.push(snapshot(m / 12, noLoan, 0));
        pointsYes.push(snapshot(m / 12, invested, outstanding()));
      }
    }

    if (loanOn && outstanding() > 0.5) {
      warnings.push("The projection ends before the loan is fully repaid. Outstanding loan: " + formatMoney(outstanding(), 2) + ".");
    }
    if (reducedOrigination) {
      warnings.push("At least one loan was reduced to the available invested balance or typical IRS cap.");
    }
    if (skippedOrigination) {
      warnings.push("At least one scheduled loan was skipped because no invested balance was available.");
    }
    if (overlapping) {
      warnings.push("A new loan started before the previous one was fully repaid. Many plans allow only one outstanding loan.");
    }

    var empLimit = employeeMax(input.ageBand || "base");
    if (input.employeeAnnual > empLimit + 0.005) {
      warnings.push(
        "Employee deferral exceeds the 2026 IRS elective-deferral maximum for the selected age band (" +
          formatMoney(empLimit) +
          ")."
      );
    }
    var catchup =
      input.ageBand === "super"
        ? LIMITS_2026.catchupSuper
        : input.ageBand === "catchup"
          ? LIMITS_2026.catchup50
          : 0;
    var additions = Math.max(0, input.employeeAnnual - catchup) + employerAnnual;
    if (additions > LIMITS_2026.annualAdditions + 0.005) {
      warnings.push(
        "Employee + employer contributions exceed the 2026 §415 annual-additions limit (" +
          formatMoney(LIMITS_2026.annualAdditions) +
          "), not counting catch-up."
      );
    }

    var endNo = pointsNo[pointsNo.length - 1].value;
    var endYes = pointsYes[pointsYes.length - 1].value;

    return {
      ok: true,
      employerAnnual: employerAnnual,
      monthlyLoanPayment: loanOn && loanCount > 0 ? roundMoney(standardPayment) : 0,
      loanTaken: roundMoney(totalTaken),
      loanCount: loanCount,
      interestPaid: roundMoney(interestPaid),
      principalRepaid: roundMoney(principalRepaid),
      loanRemaining: roundMoney(outstanding()),
      endWithoutLoan: roundMoney(endNo),
      endWithLoan: roundMoney(endYes),
      difference: roundMoney(endYes - endNo),
      pointsWithoutLoan: pointsNo,
      pointsWithLoan: pointsYes,
      warnings: warnings,
      loanEnabled: loanOn,
    };
  }

  return {
    MAX_BALANCE: MAX_BALANCE,
    MAX_RATE: MAX_RATE,
    MIN_YEARS: MIN_YEARS,
    MAX_YEARS: MAX_YEARS,
    MAX_LOAN_TERM: MAX_LOAN_TERM,
    LIMITS_2026: LIMITS_2026,
    roundMoney: roundMoney,
    formatMoney: formatMoney,
    employeeMax: employeeMax,
    employerMatch: employerMatch,
    amortizingPayment: amortizingPayment,
    nearestIndex: nearestIndex,
    validate: validate,
    simulate: simulate,
  };
});

(function () {
  if (typeof document === "undefined") return;

  var root = document.getElementById("k401GrowthTool");
  if (!root) return;

  var utils = typeof K401Growth !== "undefined" ? K401Growth : null;
  if (!utils) return;

  var balanceEl = document.getElementById("k401Balance");
  var salaryEl = document.getElementById("k401Salary");
  var employeeEl = document.getElementById("k401Employee");
  var ageBandEl = document.getElementById("k401AgeBand");
  var matchRateEl = document.getElementById("k401MatchRate");
  var matchCapEl = document.getElementById("k401MatchCap");
  var returnEl = document.getElementById("k401Return");
  var yearsEl = document.getElementById("k401Years");
  var loanOnEl = document.getElementById("k401LoanOn");
  var loanFields = document.getElementById("k401LoanFields");
  var loanAmountEl = document.getElementById("k401LoanAmount");
  var loanAprEl = document.getElementById("k401LoanApr");
  var loanTermEl = document.getElementById("k401LoanTerm");
  var loanStartEl = document.getElementById("k401LoanStart");
  var loanRepeatEl = document.getElementById("k401LoanRepeat");
  var loanRepeatYearsEl = document.getElementById("k401LoanRepeatYears");
  var repeatFields = document.getElementById("k401RepeatFields");
  var statusEl = document.getElementById("k401Status");
  var summaryEl = document.getElementById("k401Summary");
  var matchNoteEl = document.getElementById("k401MatchNote");
  var chartCanvas = document.getElementById("k401Chart");
  var chartReadoutEl = document.getElementById("k401ChartReadout");
  var chartAnnounceEl = document.getElementById("k401ChartAnnounce");
  var tableBody = document.getElementById("k401TableBody");
  var tableWrap = document.getElementById("k401TableWrap");

  var COLOR_NO = "#2660ab";
  var COLOR_YES = "#b85c38";

  var DEFAULTS = {
    balance: 80000,
    salary: 120000,
    employee: utils.LIMITS_2026.employee,
    ageBand: "base",
    matchRate: 50,
    matchCap: 6,
    returnPct: 7,
    years: 30,
    loanOn: true,
    loanAmount: 20000,
    loanApr: 8,
    loanTerm: 5,
    loanStart: 0,
    loanRepeat: true,
    loanRepeatYears: 5,
  };

  var lastResult = null;
  var chartState = null;
  var scrubIndex = null;
  var isPointerDown = false;
  var debounceTimer = null;

  function parseNumber(el, fallback) {
    var value = parseFloat(el.value);
    if (!isFinite(value)) return fallback;
    return value;
  }

  function parseIntField(el, fallback) {
    var value = parseInt(el.value, 10);
    if (!isFinite(value)) return fallback;
    return value;
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function setLoanFieldsOpen(on) {
    if (!loanFields) return;
    loanFields.hidden = !on;
    setRepeatFieldsOpen(on && loanRepeatEl.checked);
  }

  function setRepeatFieldsOpen(on) {
    if (!repeatFields) return;
    repeatFields.hidden = !on;
  }

  function readInput() {
    return {
      balance: parseNumber(balanceEl, NaN),
      salary: parseNumber(salaryEl, NaN),
      employeeAnnual: parseNumber(employeeEl, NaN),
      ageBand: ageBandEl.value,
      matchRatePct: parseNumber(matchRateEl, NaN),
      matchCapPct: parseNumber(matchCapEl, NaN),
      returnPct: parseNumber(returnEl, NaN),
      years: parseIntField(yearsEl, NaN),
      loanEnabled: loanOnEl.checked,
      loanAmount: parseNumber(loanAmountEl, NaN),
      loanApr: parseNumber(loanAprEl, NaN),
      loanTermYears: parseIntField(loanTermEl, NaN),
      loanStartYear: parseIntField(loanStartEl, NaN),
      loanRepeat: loanRepeatEl.checked,
      loanRepeatYears: parseIntField(loanRepeatYearsEl, NaN),
    };
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

  function updateMatchNote() {
    var input = readInput();
    var match = utils.employerMatch(input.employeeAnnual, input.salary, input.matchRatePct, input.matchCapPct);
    if (!Number.isFinite(match)) {
      matchNoteEl.textContent = "";
      return;
    }
    matchNoteEl.textContent =
      "Estimated employer match: " +
      utils.formatMoney(match) +
      "/year  ·  2026 employee max for this age band: " +
      utils.formatMoney(utils.employeeMax(input.ageBand));
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

  function measureMoney(ctx, n) {
    ctx.font = "12px Verdana, sans-serif";
    return ctx.measureText(utils.formatMoney(n)).width;
  }

  function paintChart() {
    if (!chartCanvas || !chartState) return;
    var ctx = ensureCanvasContext();
    if (!ctx) return;

    var seriesList = chartState.series;
    var pad = chartState.pad;
    var cssW = chartState.cssW;
    var cssH = chartState.cssH;
    var w = chartState.w;
    var h = chartState.h;
    var minV = chartState.minV;
    var maxV = chartState.maxV;
    var maxYear = chartState.maxYear;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, cssW, cssH);

    function xFor(year) {
      if (maxYear <= 0) return pad.left;
      return pad.left + (year / maxYear) * w;
    }
    function yFor(value) {
      return pad.top + h - ((value - minV) / (maxV - minV)) * h;
    }

    var yTicks = 4;
    ctx.strokeStyle = "#e2e2e2";
    ctx.lineWidth = 1;
    for (var yi = 0; yi <= yTicks; yi++) {
      var tickVal = minV + ((maxV - minV) * yi) / yTicks;
      var y = yFor(tickVal);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();
      ctx.fillStyle = "#666";
      ctx.font = "12px Verdana, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(utils.formatMoney(tickVal), pad.left - 8, y);
    }

    var xTickCount = Math.min(6, maxYear);
    for (var t = 0; t <= xTickCount; t++) {
      var year = Math.round((maxYear * t) / xTickCount);
      var x = xFor(year);
      ctx.strokeStyle = "#eeeeee";
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + h);
      ctx.stroke();
      ctx.fillStyle = "#666";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(year), x, pad.top + h + 8);
    }

    ctx.strokeStyle = "#999";
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + h);
    ctx.lineTo(pad.left + w, pad.top + h);
    ctx.stroke();

    seriesList.forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2.25;
      ctx.beginPath();
      series.points.forEach(function (point, pi) {
        var px = xFor(point.year);
        var py = yFor(point.value);
        if (pi === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      var last = series.points[series.points.length - 1];
      if (last) {
        ctx.fillStyle = series.color;
        ctx.beginPath();
        ctx.arc(xFor(last.year), yFor(last.value), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    var legendX = pad.left + 8;
    var legendY = pad.top + 8;
    seriesList.forEach(function (series, index) {
      ctx.fillStyle = series.color;
      ctx.fillRect(legendX, legendY + index * 18, 12, 12);
      ctx.fillStyle = "#333";
      ctx.font = "12px Verdana, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(series.label, legendX + 18, legendY + index * 18 + 6);
    });

    if (scrubIndex == null || !chartState.pointsNo[scrubIndex]) return;

    var rowYear = chartState.pointsNo[scrubIndex].year;
    var sx = xFor(rowYear);
    ctx.strokeStyle = "rgba(38, 96, 171, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, pad.top);
    ctx.lineTo(sx, pad.top + h);
    ctx.stroke();
    ctx.setLineDash([]);

    seriesList.forEach(function (series) {
      var pt = series.points[scrubIndex];
      if (!pt) return;
      ctx.fillStyle = series.color;
      ctx.beginPath();
      ctx.arc(xFor(pt.year), yFor(pt.value), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(xFor(pt.year), yFor(pt.value), 2, 0, Math.PI * 2);
      ctx.fill();
    });

    var noPt = chartState.pointsNo[scrubIndex];
    var yesPt = chartState.pointsYes ? chartState.pointsYes[scrubIndex] : null;
    var label =
      "Year " +
      noPt.year +
      "  ·  no loan " +
      utils.formatMoney(noPt.value) +
      (yesPt ? "  ·  with loan " + utils.formatMoney(yesPt.value) : "");
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    var labelW = ctx.measureText(label).width;
    var boxW = labelW + 20;
    var boxH = 24;
    var boxX = sx - boxW / 2;
    var boxY = pad.top + 8 + seriesList.length * 18 + 6;
    if (boxX < pad.left) boxX = pad.left;
    if (boxX + boxW > pad.left + w) boxX = pad.left + w - boxW;
    ctx.fillStyle = "rgba(34, 34, 34, 0.92)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, boxX + 10, boxY + boxH / 2);
  }

  function drawChart(result) {
    if (!chartCanvas || !result || !result.ok) {
      chartState = null;
      lastResult = result;
      return;
    }

    var series = [
      { label: "Without loan", color: COLOR_NO, points: result.pointsWithoutLoan },
    ];
    if (result.loanEnabled) {
      series.push({ label: "With loan", color: COLOR_YES, points: result.pointsWithLoan });
    }

    var cssW = chartCanvas.clientWidth || 720;
    var cssH = Math.max(260, Math.round(cssW * 0.5));
    var allPoints = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        allPoints.push(p);
      });
    });
    var minV = allPoints[0].value;
    var maxV = allPoints[0].value;
    var maxYear = 0;
    allPoints.forEach(function (p) {
      if (p.value < minV) minV = p.value;
      if (p.value > maxV) maxV = p.value;
      if (p.year > maxYear) maxYear = p.year;
    });
    if (maxV === minV) {
      maxV = minV + 1;
    }
    var range = maxV - minV;
    minV = Math.max(0, minV - range * 0.05);
    maxV = maxV + range * 0.08;

    var probe = chartCanvas.getContext("2d");
    var widest = 0;
    for (var i = 0; i <= 4; i++) {
      widest = Math.max(widest, measureMoney(probe, minV + ((maxV - minV) * i) / 4));
    }
    var pad = { top: 16, right: 16, bottom: 36, left: Math.max(64, Math.ceil(widest + 16)) };
    chartState = {
      series: series,
      pointsNo: result.pointsWithoutLoan,
      pointsYes: result.loanEnabled ? result.pointsWithLoan : null,
      pad: pad,
      cssW: cssW,
      cssH: cssH,
      w: cssW - pad.left - pad.right,
      h: cssH - pad.top - pad.bottom,
      minV: minV,
      maxV: maxV,
      maxYear: maxYear,
    };
    if (scrubIndex != null && scrubIndex >= result.pointsWithoutLoan.length) {
      scrubIndex = result.pointsWithoutLoan.length - 1;
    }
    paintChart();
  }

  function setChartReadout(idx, announce) {
    if (!chartReadoutEl) return;
    if (idx == null || !chartState || !chartState.pointsNo[idx]) {
      chartReadoutEl.textContent = "";
      chartReadoutEl.hidden = true;
      if (announce && chartAnnounceEl) chartAnnounceEl.textContent = "";
      return;
    }
    var noPt = chartState.pointsNo[idx];
    var yesPt = chartState.pointsYes ? chartState.pointsYes[idx] : null;
    var text =
      "Year " +
      noPt.year +
      ": without loan " +
      utils.formatMoney(noPt.value) +
      (yesPt ? "; with loan " + utils.formatMoney(yesPt.value) : "") +
      (yesPt && yesPt.loanRemaining > 0
        ? "; loan remaining " + utils.formatMoney(yesPt.loanRemaining, 0)
        : "");
    chartReadoutEl.hidden = false;
    chartReadoutEl.textContent = text;
    if (announce && chartAnnounceEl) chartAnnounceEl.textContent = text;
  }

  function pointerToIndex(clientX) {
    if (!chartState || !chartCanvas) return null;
    var rect = chartCanvas.getBoundingClientRect();
    return utils.nearestIndex(
      clientX - rect.left,
      chartState.pointsNo.length,
      chartState.pad.left,
      chartState.w
    );
  }

  function pointerInsideCanvas(clientX, clientY) {
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
    if (idx == null || idx === scrubIndex) return;
    scrubIndex = idx;
    paintChart();
    setChartReadout(idx, false);
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

  function renderTable(result) {
    tableBody.innerHTML = "";
    if (!result || !result.ok) {
      tableWrap.hidden = true;
      return;
    }
    var rows = result.pointsWithoutLoan;
    for (var i = 0; i < rows.length; i++) {
      var noPt = rows[i];
      var yesPt = result.pointsWithLoan[i];
      var tr = document.createElement("tr");
      if (i === 0 || i === rows.length - 1) tr.className = "is-endpoint";
      var cells =
        "<td>" +
        noPt.year +
        "</td><td>" +
        utils.formatMoney(noPt.value) +
        "</td>";
      if (result.loanEnabled) {
        cells +=
          "<td>" +
          utils.formatMoney(yesPt.value) +
          "</td><td>" +
          (yesPt.loanRemaining > 0 ? utils.formatMoney(yesPt.loanRemaining) : "—") +
          "</td>";
      }
      tr.innerHTML = cells;
      tableBody.appendChild(tr);
    }
    tableWrap.hidden = false;
    var withHead = document.getElementById("k401HeadWith");
    var loanHead = document.getElementById("k401HeadLoan");
    if (withHead) withHead.hidden = !result.loanEnabled;
    if (loanHead) loanHead.hidden = !result.loanEnabled;
  }

  function render() {
    updateMatchNote();
    var input = readInput();
    var result = utils.simulate(input);
    lastResult = result;
    if (!result.ok) {
      setStatus(result.error, true);
      summaryEl.textContent = "";
      tableWrap.hidden = true;
      drawChart(null);
      return;
    }

    var warningText = result.warnings.join(" ");
    setStatus(warningText, result.warnings.length > 0);

    summaryEl.textContent = "";
    summaryEl.appendChild(summaryItem("Without loan", utils.formatMoney(result.endWithoutLoan)));
    if (result.loanEnabled) {
      summaryEl.appendChild(summaryItem("With loan", utils.formatMoney(result.endWithLoan)));
      var delta = result.difference;
      var deltaLabel = delta >= 0 ? "Loan ends ahead by" : "Loan ends behind by";
      summaryEl.appendChild(summaryItem(deltaLabel, utils.formatMoney(Math.abs(delta))));
      summaryEl.appendChild(
        summaryItem("Monthly loan payment", utils.formatMoney(result.monthlyLoanPayment, 2))
      );
      if (result.loanCount > 1) {
        summaryEl.appendChild(summaryItem("Loans taken", String(result.loanCount)));
        summaryEl.appendChild(summaryItem("Total borrowed", utils.formatMoney(result.loanTaken)));
      }
      summaryEl.appendChild(
        summaryItem("Interest paid to yourself", utils.formatMoney(result.interestPaid, 2))
      );
    } else {
      summaryEl.appendChild(summaryItem("Employer match / year", utils.formatMoney(result.employerAnnual)));
    }

    drawChart(result);
    renderTable(result);
    if (scrubIndex != null) setChartReadout(scrubIndex, false);
  }

  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 40);
  }

  function resetDefaults() {
    balanceEl.value = String(DEFAULTS.balance);
    salaryEl.value = String(DEFAULTS.salary);
    employeeEl.value = String(DEFAULTS.employee);
    ageBandEl.value = DEFAULTS.ageBand;
    matchRateEl.value = String(DEFAULTS.matchRate);
    matchCapEl.value = String(DEFAULTS.matchCap);
    returnEl.value = String(DEFAULTS.returnPct);
    yearsEl.value = String(DEFAULTS.years);
    loanOnEl.checked = DEFAULTS.loanOn;
    loanAmountEl.value = String(DEFAULTS.loanAmount);
    loanAprEl.value = String(DEFAULTS.loanApr);
    loanTermEl.value = String(DEFAULTS.loanTerm);
    loanStartEl.value = String(DEFAULTS.loanStart);
    loanRepeatEl.checked = DEFAULTS.loanRepeat;
    loanRepeatYearsEl.value = String(DEFAULTS.loanRepeatYears);
    setLoanFieldsOpen(DEFAULTS.loanOn);
    scrubIndex = null;
    render();
    setStatus("Reset to sample values.");
  }

  function applyMaxContribution() {
    employeeEl.value = String(utils.employeeMax(ageBandEl.value));
    scheduleRender();
  }

  root.querySelectorAll("[data-k401-max]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      ageBandEl.value = btn.getAttribute("data-k401-max");
      applyMaxContribution();
    });
  });

  ageBandEl.addEventListener("change", function () {
    updateMatchNote();
    scheduleRender();
  });
  loanOnEl.addEventListener("change", function () {
    setLoanFieldsOpen(loanOnEl.checked);
    scheduleRender();
  });
  loanRepeatEl.addEventListener("change", function () {
    setRepeatFieldsOpen(loanOnEl.checked && loanRepeatEl.checked);
    scheduleRender();
  });
  document.getElementById("k401RepeatMatchTerm").addEventListener("click", function () {
    loanRepeatYearsEl.value = String(parseIntField(loanTermEl, DEFAULTS.loanTerm));
    scheduleRender();
  });

  [
    balanceEl,
    salaryEl,
    employeeEl,
    matchRateEl,
    matchCapEl,
    returnEl,
    yearsEl,
    loanAmountEl,
    loanAprEl,
    loanTermEl,
    loanStartEl,
    loanRepeatYearsEl,
  ].forEach(function (el) {
    el.addEventListener("input", scheduleRender);
    el.addEventListener("change", scheduleRender);
  });

  document.getElementById("k401Reset").addEventListener("click", resetDefaults);

  if (chartCanvas) {
    chartCanvas.style.touchAction = "none";
    chartCanvas.addEventListener("pointerdown", function (evt) {
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
    });
    chartCanvas.addEventListener("pointermove", function (evt) {
      if (!chartState) return;
      if (evt.pointerType === "mouse" || isPointerDown) scrubTo(evt.clientX);
    });
    chartCanvas.addEventListener("pointerup", function (evt) {
      var wasDown = isPointerDown;
      isPointerDown = false;
      if (!wasDown && scrubIndex == null) return;
      if (evt.pointerType === "mouse" || evt.pointerType === "") {
        if (!pointerInsideCanvas(evt.clientX, evt.clientY)) {
          clearScrub(true);
          return;
        }
      }
      setChartReadout(scrubIndex, true);
    });
    chartCanvas.addEventListener("pointercancel", function () {
      isPointerDown = false;
    });
    chartCanvas.addEventListener("lostpointercapture", function () {
      isPointerDown = false;
    });
    chartCanvas.addEventListener("pointerleave", function () {
      if (!isPointerDown) clearScrub(true);
    });
    chartCanvas.addEventListener("keydown", function (evt) {
      if (!chartState) return;
      var len = chartState.pointsNo.length;
      var next = scrubIndex == null ? len - 1 : scrubIndex;
      if (evt.key === "ArrowLeft") next = Math.max(0, next - 1);
      else if (evt.key === "ArrowRight") next = Math.min(len - 1, next + 1);
      else if (evt.key === "Home") next = 0;
      else if (evt.key === "End") next = len - 1;
      else if (evt.key === "Escape") {
        clearScrub(true);
        return;
      } else return;
      evt.preventDefault();
      scrubIndex = next;
      paintChart();
      setChartReadout(next, true);
    });
  }

  window.addEventListener("resize", scheduleRender);

  setLoanFieldsOpen(loanOnEl.checked);
  render();
})();
