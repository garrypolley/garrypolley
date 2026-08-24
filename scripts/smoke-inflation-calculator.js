#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var fs = require("fs");
var utils = require(path.join(__dirname, "..", "static", "js", "inflation-calculator.js"));

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

var payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "static", "data", "cpi-u-annual.json"), "utf8")
);
var cpi = utils.parseCpiPayload(payload);

check("CPI payload spans 1913 through a recent year", function () {
  assert.strictEqual(cpi.minYear, 1913);
  assert.ok(cpi.maxYear >= 2024);
  assert.ok(cpi.years.length >= 100);
  assert.ok(Number.isFinite(cpi.annual[1913]));
  assert.ok(Number.isFinite(cpi.annual[cpi.maxYear]));
});

check("convert $60 from 1913 to 2024 matches CPI ratio", function () {
  var from = cpi.annual[1913];
  var to = cpi.annual[2024];
  var result = utils.convert(60, from, to);
  assert.ok(result.ok);
  almostEqual(result.value, utils.roundMoney(60 * (to / from)), 0.001);
  assert.ok(result.value > 1000, "1913 dollars should inflate a lot by 2024");
});

check("convert rejects negative amounts and bad indexes", function () {
  assert.strictEqual(utils.convert(-1, 10, 20).ok, false);
  assert.strictEqual(utils.convert(10, 0, 20).ok, false);
  assert.strictEqual(utils.convert(10, 10, -1).ok, false);
});

check("series includes endpoints and intermediate years", function () {
  var result = utils.series(100, 2000, 2005, cpi.annual);
  assert.ok(result.ok);
  assert.strictEqual(result.rows.length, 6);
  assert.strictEqual(result.rows[0].year, 2000);
  assert.strictEqual(result.rows[5].year, 2005);
  assert.strictEqual(result.rows[0].value, 100);
  assert.ok(result.rows[5].value > 100);
});

check("series works when toYear is earlier than fromYear", function () {
  var result = utils.series(100, 2020, 2010, cpi.annual);
  assert.ok(result.ok);
  assert.strictEqual(result.rows[0].year, 2010);
  assert.strictEqual(result.rows[result.rows.length - 1].year, 2020);
});

check("series fails for missing from year", function () {
  var result = utils.series(60, 1912, 2020, cpi.annual);
  assert.strictEqual(result.ok, false);
});

check("yearsBetween is inclusive both ways", function () {
  assert.deepStrictEqual(utils.yearsBetween(1913, 1915), [1913, 1914, 1915]);
  assert.deepStrictEqual(utils.yearsBetween(1915, 1913), [1913, 1914, 1915]);
});

check("formatMoney returns USD currency string", function () {
  assert.ok(utils.formatMoney(1951.17).indexOf("1,951.17") >= 0);
});

if (!process.exitCode) {
  console.log("All inflation calculator smoke checks passed.");
}
