#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static/js/qr-code.js"));

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

check("normalizePayload trims and rejects empty or huge input", function () {
  assert.strictEqual(utils.normalizePayload("  https://garrypolley.com  "), "https://garrypolley.com");
  assert.throws(function () {
    utils.normalizePayload("   ");
  }, /Paste a link/);
  assert.throws(function () {
    utils.normalizePayload(new Array(utils.MAX_PAYLOAD + 2).join("a"));
  }, /characters/);
});

check("parseHexColor accepts #rgb and #rrggbb", function () {
  assert.strictEqual(utils.parseHexColor("#abc", utils.DEFAULT_FG), "#aabbcc");
  assert.strictEqual(utils.parseHexColor("#112233", utils.DEFAULT_FG), "#112233");
  assert.strictEqual(utils.parseHexColor("nope", utils.DEFAULT_FG), utils.DEFAULT_FG);
});

check("clamp helpers bound size and logo percent", function () {
  assert.strictEqual(utils.clampOutputSize(10), utils.MIN_OUTPUT);
  assert.strictEqual(utils.clampOutputSize(9999), utils.MAX_OUTPUT);
  assert.strictEqual(utils.clampOutputSize(384), 384);
  assert.strictEqual(utils.clampLogoPercent(1), utils.MIN_LOGO_PCT);
  assert.strictEqual(utils.clampLogoPercent(80), utils.MAX_LOGO_PCT);
  assert.strictEqual(utils.clampLogoPercent(18), 18);
});

check("overlay uses high error correction", function () {
  assert.strictEqual(utils.chooseEcc(false), "M");
  assert.strictEqual(utils.chooseEcc(true), "H");
});

check("filename prefers a URL host", function () {
  assert.strictEqual(utils.filenameFromPayload("https://www.garrypolley.com/tool/"), "garrypolley.com.png");
  assert.strictEqual(utils.filenameFromPayload("hello world"), "hello-world.png");
  assert.strictEqual(utils.filenameFromPayload("   "), "qr-code.png");
});

check("overlay box stays inside the QR symbol", function () {
  var box = utils.overlayBox(25, 8, 18);
  assert.ok(box.inner > 0);
  assert.ok(box.total > box.inner);
  assert.ok(box.total < 25 * 8);
});

check("encodes a link with finder patterns in the corners", function () {
  var qr = utils.encodePayload("https://garrypolley.com", "M");
  assert.ok(qr.size >= 21);
  assert.ok(qr.getModule(0, 0));
  assert.ok(qr.getModule(qr.size - 1, 0));
  assert.ok(qr.getModule(0, qr.size - 1));
  assert.strictEqual(qr.getModule(0, 7), false);
});

check("center overlay bumps error correction and still encodes", function () {
  var qr = utils.encodePayload("https://garrypolley.com", utils.chooseEcc(true));
  assert.ok(qr.size >= 21);
  assert.ok(qr.version >= 1);
});

if (!process.exitCode) {
  console.log("All QR code smoke checks passed.");
}
