#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static", "js", "gif-slicer.js"));

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

check("clampFrameRange swaps and bounds", function () {
  assert.deepStrictEqual(utils.clampFrameRange(5, 2, 10), { start: 2, end: 5, count: 4 });
  assert.deepStrictEqual(utils.clampFrameRange(-3, 99, 4), { start: 0, end: 3, count: 4 });
  assert.deepStrictEqual(utils.clampFrameRange(0, 0, 0), { start: 0, end: 0, count: 0 });
});

check("normalizeTextStyle defaults and clamps", function () {
  var style = utils.normalizeTextStyle({
    text: "Hi",
    fontSize: 999,
    strokeWidth: -2,
    position: "nope",
    align: "nope",
    fillColor: "#fff",
    fontFamily: "not-a-font"
  });
  assert.strictEqual(style.fontSize, utils.MAX_FONT_SIZE);
  assert.strictEqual(style.strokeWidth, 0);
  assert.strictEqual(style.position, "top");
  assert.strictEqual(style.align, "center");
  assert.strictEqual(style.fillColor, "#ffffff");
  assert.strictEqual(style.fontFamily, utils.FONTS[0]);
  assert.strictEqual(style.bold, false);
});

check("buildFontCss includes weight and style", function () {
  var css = utils.buildFontCss(
    utils.normalizeTextStyle({ bold: true, italic: true, fontSize: 24, fontFamily: utils.FONTS[2] })
  );
  assert.ok(/italic/.test(css));
  assert.ok(/bold/.test(css));
  assert.ok(/24px/.test(css));
});

check("lzwEncode/lzwDecode round-trip indices", function () {
  var indices = [0, 1, 2, 2, 1, 0, 0, 1, 2];
  var minCodeSize = 2;
  var encoded = utils.lzwEncode(minCodeSize, indices);
  var decoded = utils.lzwDecode(minCodeSize, encoded);
  assert.deepStrictEqual(decoded, indices);
});

check("parseGif + sliceFrames + encodeGif round-trip", function () {
  // Build a tiny 2-frame GIF via encoder, then parse and slice.
  function solidFrame(r, g, b, delayCs) {
    var pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (var i = 0; i < pixels.length; i += 4) {
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
    return { pixels: pixels, delayCs: delayCs };
  }

  var original = {
    width: 4,
    height: 4,
    loopCount: 0,
    frames: [solidFrame(255, 0, 0, 8), solidFrame(0, 0, 255, 12), solidFrame(0, 255, 0, 10)]
  };

  var bytes = utils.encodeGif(original);
  assert.ok(bytes.length > 20);
  assert.strictEqual(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]), "GIF89a");

  var parsed = utils.parseGif(bytes.buffer);
  assert.strictEqual(parsed.width, 4);
  assert.strictEqual(parsed.height, 4);
  assert.strictEqual(parsed.frames.length, 3);

  var sliced = utils.sliceFrames(parsed, 1, 2);
  assert.strictEqual(sliced.frames.length, 2);
  assert.strictEqual(sliced.range.start, 1);
  assert.strictEqual(sliced.range.end, 2);

  var again = utils.encodeGif(sliced);
  var reparsed = utils.parseGif(again.buffer);
  assert.strictEqual(reparsed.frames.length, 2);
});

check("delayMs converts centiseconds", function () {
  assert.strictEqual(utils.delayMs(10), 100);
  assert.strictEqual(utils.delayMs(0), 100);
  assert.strictEqual(utils.delayMs(25), 250);
});

if (!process.exitCode) {
  console.log("All gif-slicer smoke checks passed.");
}
