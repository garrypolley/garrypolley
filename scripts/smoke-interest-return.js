#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static", "js", "interest-return.js"));

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
  epsilon = epsilon == null ? 0.02 : epsilon;
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    "expected " + expected + " ± " + epsilon + ", got " + actual
  );
}

check("futureValue yearly compound matches sample", function () {
  var ending = utils.futureValue(25000, 3, 30, "yearly");
  almostEqual(ending, 60681.56, 0.05);
});

check("futureValue simple interest has no compounding", function () {
  var ending = utils.futureValue(25000, 3, 30, "none");
  almostEqual(ending, 47500, 0.01);
});

check("savings daily APR year-1 interest and APY", function () {
  var year1 = utils.futureValue(10000, 3.7, 1, "daily");
  almostEqual(year1 - 10000, 376.91, 0.05);
  var apy = utils.apyFromApr(3.7, "daily");
  almostEqual(apy * 100, 3.7691, 0.001);
});

check("seriesCompound length and endpoints", function () {
  var points = utils.seriesCompound(1000, 5, 5, "yearly");
  assert.strictEqual(points.length, 6);
  assert.strictEqual(points[0].year, 0);
  assert.strictEqual(points[0].value, 1000);
  almostEqual(points[5].value, utils.futureValue(1000, 5, 5, "yearly"));
});

check("validateCommon rejects oversized principal and rate", function () {
  assert.ok(utils.validateCommon(utils.MAX_PRINCIPAL + 1, 3, 10));
  assert.ok(utils.validateCommon(1000, utils.MAX_RATE + 1, 10));
  assert.strictEqual(utils.validateCommon(1000, 3, 10), null);
});

check("parseYears rejects decimals and out-of-range", function () {
  assert.ok(utils.parseYears("30.5").error);
  assert.ok(utils.parseYears("0").error);
  assert.ok(utils.parseYears("101").error);
  assert.strictEqual(utils.parseYears("30").value, 30);
});

check("seriesStepped models accelerating growth and rejects gaps", function () {
  var ok = utils.seriesStepped(25000, [
    { start: 1, end: 5, rate: 2 },
    { start: 6, end: 15, rate: 5 },
    { start: 16, end: 30, rate: 8 },
  ]);
  assert.strictEqual(ok.error, null);
  assert.strictEqual(ok.maxYear, 30);
  assert.ok(ok.points[ok.points.length - 1].value > 25000);

  var gap = utils.seriesStepped(25000, [
    { start: 1, end: 5, rate: 2 },
    { start: 7, end: 10, rate: 5 },
  ]);
  assert.ok(gap.error);
});

check("assertFiniteSeries catches Infinity", function () {
  assert.ok(utils.assertFiniteSeries([{ year: 1, value: Infinity }]));
  assert.strictEqual(utils.assertFiniteSeries([{ year: 1, value: 10 }]), null);
});

check("wrapTextLines wraps long subtitles", function () {
  var lines = utils.wrapTextLines(
    function (text) {
      return text.length * 8;
    },
    "alpha beta gamma delta epsilon",
    40
  );
  assert.ok(lines.length > 1);
  assert.strictEqual(lines.join(" ").replace(/\s+/g, " "), "alpha beta gamma delta epsilon");
});

check("compare advantage is positive for compound over simple", function () {
  var simple = utils.futureValue(25000, 3, 30, "none");
  var compound = utils.futureValue(25000, 3, 30, "yearly");
  almostEqual(compound - simple, 13181.56, 0.05);
});

if (process.exitCode) {
  console.error("smoke tests failed");
  process.exit(process.exitCode);
}

console.log("all smoke tests passed");
