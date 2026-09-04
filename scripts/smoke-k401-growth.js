#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static", "js", "k401-growth.js"));

function check(name, fn) {
  try {
    fn();
    console.log("ok - " + name);
  } catch (err) {
    console.error("fail - " + name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

function almostEqual(actual, expected, epsilon) {
  epsilon = epsilon == null ? 0.05 : epsilon;
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    "expected " + expected + " ± " + epsilon + ", got " + actual
  );
}

function baseInput(overrides) {
  var input = {
    balance: 80000,
    salary: 120000,
    employeeAnnual: 24500,
    ageBand: "base",
    matchRatePct: 50,
    matchCapPct: 6,
    returnPct: 7,
    years: 30,
    loanEnabled: true,
    loanAmount: 20000,
    loanApr: 8,
    loanTermYears: 5,
    loanStartYear: 0,
  };
  Object.keys(overrides || {}).forEach(function (key) {
    input[key] = overrides[key];
  });
  return input;
}

check("2026 employee max by age band", function () {
  assert.strictEqual(utils.employeeMax("base"), 24500);
  assert.strictEqual(utils.employeeMax("catchup"), 32500);
  assert.strictEqual(utils.employeeMax("super"), 35750);
});

check("employer match is 50% of the first 6% of salary", function () {
  // min(24500, 0.06 * 120000=7200) * 50% = 3600
  almostEqual(utils.employerMatch(24500, 120000, 50, 6), 3600, 0.01);
  assert.strictEqual(utils.employerMatch(24500, 0, 50, 6), 0);
  assert.strictEqual(utils.employerMatch(0, 120000, 50, 6), 0);
});

check("amortizing payment for $20k at 8% over 60 months", function () {
  var i = 0.08 / 12;
  var n = 60;
  var factor = Math.pow(1 + i, n);
  var expected = (20000 * (i * factor)) / (factor - 1);
  almostEqual(utils.amortizingPayment(20000, 8, 60), expected, 0.01);
  almostEqual(utils.amortizingPayment(12000, 0, 24), 500, 0.01);
});

check("validate rejects out-of-range years and loan start", function () {
  assert.ok(utils.validate(baseInput({ years: 0 })));
  assert.ok(utils.validate(baseInput({ loanStartYear: 30, years: 30 })));
  assert.strictEqual(utils.validate(baseInput()), null);
});

check("no-loan series grows and ends above the starting balance", function () {
  var result = utils.simulate(baseInput({ loanEnabled: false }));
  assert.ok(result.ok);
  assert.strictEqual(result.pointsWithoutLoan.length, 31);
  assert.strictEqual(result.pointsWithoutLoan[0].value, 80000);
  assert.ok(result.endWithoutLoan > 80000);
  almostEqual(result.employerAnnual, 3600, 0.01);
});

check("loan origination drops year-0 invested balance", function () {
  var result = utils.simulate(baseInput());
  assert.ok(result.ok);
  assert.strictEqual(result.loanTaken, 20000);
  almostEqual(result.pointsWithLoan[0].value, 60000, 0.01);
  assert.ok(result.monthlyLoanPayment > 400);
  almostEqual(result.loanRemaining, 0, 1);
});

check("loan interest is repaid into the account over the term", function () {
  var result = utils.simulate(
    baseInput({
      years: 5,
      returnPct: 0,
      salary: 0,
      employeeAnnual: 0,
      loanApr: 8,
      loanTermYears: 5,
    })
  );
  assert.ok(result.ok);
  // No market return and no contributions: ending invested balance is
  // original 80k minus 20k plus all principal+interest repaid = 80k + interest.
  almostEqual(result.endWithLoan, 80000 + result.interestPaid, 1);
  assert.ok(result.interestPaid > 4000);
  almostEqual(result.principalRepaid, 20000, 1);
});

check("when loan APR equals market return, endings stay close", function () {
  var result = utils.simulate(
    baseInput({
      returnPct: 7,
      loanApr: 7,
      employeeAnnual: 0,
      salary: 0,
      years: 10,
      loanTermYears: 5,
    })
  );
  assert.ok(result.ok);
  // Missed market return is replaced by interest paid to yourself.
  almostEqual(result.endWithLoan, result.endWithoutLoan, 5);
});

check("higher loan APR than market return raises the 401(k) (new cash in)", function () {
  var low = utils.simulate(baseInput({ loanApr: 3, returnPct: 7, years: 15 }));
  var high = utils.simulate(baseInput({ loanApr: 12, returnPct: 7, years: 15 }));
  assert.ok(low.ok && high.ok);
  assert.ok(
    high.endWithLoan > low.endWithLoan,
    "higher APR should deposit more interest into the plan"
  );
});

check("loan cannot exceed the invested balance", function () {
  var result = utils.simulate(baseInput({ balance: 10000, loanAmount: 50000 }));
  assert.ok(result.ok);
  assert.strictEqual(result.loanTaken, 10000);
  assert.ok(result.warnings.length > 0);
});

check("zero-interest loan is repaid evenly and fully", function () {
  var result = utils.simulate(
    baseInput({
      loanApr: 0,
      loanAmount: 12000,
      loanTermYears: 2,
      years: 2,
      returnPct: 0,
      employeeAnnual: 0,
      salary: 0,
    })
  );
  assert.ok(result.ok);
  almostEqual(result.monthlyLoanPayment, 500, 0.01);
  almostEqual(result.interestPaid, 0, 0.01);
  almostEqual(result.endWithLoan, 80000, 1);
  almostEqual(result.endWithoutLoan, 80000, 1);
});

if (!process.exitCode) {
  console.log("All 401(k) growth smoke checks passed.");
}
