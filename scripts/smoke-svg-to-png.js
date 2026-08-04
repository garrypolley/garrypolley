#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static", "js", "svg-to-png.js"));

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

check("clampScale defaults and bounds", function () {
  assert.strictEqual(utils.clampScale(undefined), 1);
  assert.strictEqual(utils.clampScale(0), 1);
  assert.strictEqual(utils.clampScale(-2), 1);
  assert.strictEqual(utils.clampScale(0.1), utils.MIN_SCALE);
  assert.strictEqual(utils.clampScale(1000), utils.MAX_SCALE);
  assert.strictEqual(utils.clampScale(2.5), 2.5);
});

check("findSvgStart is case-insensitive", function () {
  assert.strictEqual(utils.findSvgStart("<SVG width='1'></SVG>"), 0);
  assert.strictEqual(utils.findSvgStart("prefix <svg viewBox='0 0 1 1'></svg>"), 7);
  assert.strictEqual(utils.findSvgStart("<div></div>"), -1);
});

check("extractSvgMarkup slices to svg root", function () {
  var markup = utils.extractSvgMarkup("oops\n<SVG id='x'></SVG>");
  assert.ok(/^<SVG/i.test(markup));
  assert.throws(function () {
    utils.extractSvgMarkup("");
  }, /Paste SVG/);
});

check("parseLength and lengthToPx handle units", function () {
  assert.deepStrictEqual(utils.parseLength("100px"), { value: 100, unit: "px" });
  assert.strictEqual(utils.lengthToPx(utils.parseLength("100px")), 100);
  assert.strictEqual(utils.lengthToPx(utils.parseLength("1in")), 96);
  assert.strictEqual(utils.lengthToPx(utils.parseLength("100%")), null);
  assert.strictEqual(utils.lengthToPx(utils.parseLength("2em")), null);
});

check("resolveDimensions prefers usable px and falls back to viewBox", function () {
  var fromPercent = utils.resolveDimensions("100%", "100%", "0 0 40 20");
  assert.strictEqual(fromPercent.width, 40);
  assert.strictEqual(fromPercent.height, 20);

  var fromPx = utils.resolveDimensions("10px", "5px", null);
  assert.strictEqual(fromPx.width, 10);
  assert.strictEqual(fromPx.height, 5);

  var defaults = utils.resolveDimensions("100%", null, null);
  assert.strictEqual(defaults.width, utils.DEFAULT_WIDTH);
  assert.strictEqual(defaults.height, utils.DEFAULT_HEIGHT);
});

check("clampOutputSize caps huge canvases", function () {
  var huge = utils.clampOutputSize(50000, 50000);
  assert.ok(huge.width <= utils.MAX_DIMENSION);
  assert.ok(huge.height <= utils.MAX_DIMENSION);
  assert.ok(huge.width * huge.height <= utils.MAX_PIXELS);
});

if (process.exitCode) {
  console.error("smoke tests failed");
  process.exit(process.exitCode);
}

console.log("all smoke tests passed");
