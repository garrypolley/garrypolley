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

check("isGifFile and isVideoFile detect common types", function () {
  assert.strictEqual(utils.isGifFile({ name: "a.GIF", type: "" }), true);
  assert.strictEqual(utils.isGifFile({ name: "a.png", type: "image/gif" }), true);
  assert.strictEqual(utils.isVideoFile({ name: "clip.mp4", type: "" }), true);
  assert.strictEqual(utils.isVideoFile({ name: "clip", type: "video/webm" }), true);
  assert.strictEqual(utils.isVideoFile({ name: "photo.jpg", type: "image/jpeg" }), false);
  assert.strictEqual(utils.isGifFile({ name: "clip.mp4", type: "video/mp4" }), false);
  assert.strictEqual(utils.isVideoFile({ name: "song.ogg", type: "" }), false);
  assert.ok(utils.VIDEO_EXTENSIONS.indexOf("ogg") === -1);
});

check("planVideoCapture respects fps, duration, and memory", function () {
  var plan = utils.planVideoCapture({
    durationSec: 2,
    fps: 10,
    videoWidth: 320,
    videoHeight: 180
  });
  assert.strictEqual(plan.fps, 10);
  assert.strictEqual(plan.frameCount, 20);
  assert.strictEqual(plan.times.length, 20);
  assert.strictEqual(plan.delayCs, 10);
  assert.strictEqual(plan.truncated, false);
  assert.ok(Math.abs(plan.sampledDurationSec - 1.9) < 0.0001);

  var long = utils.planVideoCapture({
    durationSec: 120,
    fps: 24,
    videoWidth: 1920,
    videoHeight: 1080
  });
  assert.ok(long.captureDuration <= utils.MAX_VIDEO_DURATION_SEC);
  assert.ok(long.frameCount <= utils.MAX_FRAMES);
  assert.ok(long.width * long.height <= utils.MAX_PIXELS);
  assert.ok(long.width * long.height * long.frameCount <= utils.MAX_TOTAL_PIXELS);
  assert.strictEqual(long.truncated, true);
  assert.ok(long.sampledDurationSec <= long.captureDuration + 0.001);
  var desc = utils.describeVideoSample(long);
  assert.ok(/trimmed to fit/i.test(desc));
  assert.ok(!/Sampled first ~/i.test(desc));
});

check("assertFrameBudget rejects oversized totals", function () {
  assert.throws(function () {
    utils.assertFrameBudget(2000, 2000, 1);
  }, /too large/i);
  assert.throws(function () {
    utils.assertFrameBudget(800, 600, utils.MAX_FRAMES + 1);
  }, /Too many frames/i);
});

check("lzwDecode enforces max output size", function () {
  var indices = [];
  for (var i = 0; i < 20; i++) {
    indices.push(i % 4);
  }
  var encoded = utils.lzwEncode(2, indices);
  assert.throws(function () {
    utils.lzwDecode(2, encoded, 5);
  }, /too large/i);
  assert.deepStrictEqual(utils.lzwDecode(2, encoded, 20), indices);
});

check("lzwEncode/lzwDecode round-trip indices", function () {
  var indices = [0, 1, 2, 2, 1, 0, 0, 1, 2];
  var minCodeSize = 2;
  var encoded = utils.lzwEncode(minCodeSize, indices);
  var decoded = utils.lzwDecode(minCodeSize, encoded);
  assert.deepStrictEqual(decoded, indices);
});

check("parseGif + sliceFrames + encodeGif round-trip", function () {
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

check("encodeGif preserves transparency", function () {
  var pixels = new Uint8ClampedArray(2 * 2 * 4);
  // opaque red, transparent, opaque blue, transparent
  pixels.set([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0]);
  var bytes = utils.encodeGif({
    width: 2,
    height: 2,
    frames: [{ pixels: pixels, delayCs: 10 }]
  });
  var parsed = utils.parseGif(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.strictEqual(parsed.frames.length, 1);
  var out = parsed.frames[0].pixels;
  assert.strictEqual(out[3], 255); // opaque
  assert.ok(out[0] > 200 && out[1] < 40 && out[2] < 40); // reddish
  assert.strictEqual(out[7], 0); // transparent
  assert.strictEqual(out[11], 255);
  assert.strictEqual(out[15], 0);
});

check("delayMs converts centiseconds", function () {
  assert.strictEqual(utils.delayMs(10), 100);
  assert.strictEqual(utils.delayMs(0), 100);
  assert.strictEqual(utils.delayMs(25), 250);
});

check("forceOpaquePixels sets alpha to 255", function () {
  var pixels = new Uint8ClampedArray([1, 2, 3, 0, 4, 5, 6, 10]);
  utils.forceOpaquePixels(pixels);
  assert.strictEqual(pixels[3], 255);
  assert.strictEqual(pixels[7], 255);
});

check("assertSampledFramesUsable rejects empty/transparent frames", function () {
  var empty = new Uint8ClampedArray(2 * 2 * 4);
  assert.throws(function () {
    utils.assertSampledFramesUsable({
      width: 2,
      height: 2,
      frames: [{ pixels: empty, delayCs: 10 }]
    });
  }, /empty/i);

  var ok = new Uint8ClampedArray(2 * 2 * 4);
  for (var i = 0; i < ok.length; i += 4) {
    ok[i] = 20;
    ok[i + 1] = 30;
    ok[i + 2] = 40;
    ok[i + 3] = 255;
  }
  utils.assertSampledFramesUsable({
    width: 2,
    height: 2,
    frames: [{ pixels: ok, delayCs: 10 }]
  });
});

function runAsyncChecks() {
  var pixels = new Uint8ClampedArray(2 * 2 * 4);
  for (var i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0;
    pixels[i + 1] = 128;
    pixels[i + 2] = 255;
    pixels[i + 3] = 255;
  }

  function solidFrame(r, g, b, delayCs) {
    var framePixels = new Uint8ClampedArray(8 * 8 * 4);
    for (var j = 0; j < framePixels.length; j += 4) {
      framePixels[j] = r;
      framePixels[j + 1] = g;
      framePixels[j + 2] = b;
      framePixels[j + 3] = 255;
    }
    return { pixels: framePixels, delayCs: delayCs };
  }

  return utils
    .encodeGifAsync({
      width: 2,
      height: 2,
      frames: [{ pixels: pixels, delayCs: 8 }]
    })
    .then(function (bytes) {
      assert.ok(bytes.length > 20);
      var parsed = utils.parseGif(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      assert.strictEqual(parsed.frames.length, 1);
      console.log("ok - encodeGifAsync resolves with valid GIF bytes");
    })
    .then(function () {
      var sampled = {
        width: 8,
        height: 8,
        sourceType: "video",
        frames: [solidFrame(10, 20, 30, 10), solidFrame(200, 100, 50, 10), solidFrame(0, 255, 0, 10)]
      };
      utils.assertSampledFramesUsable(sampled);
      // Working set stays RGBA; export encodes once (no encode→parse round-trip).
      var sliced = utils.sliceFrames(sampled, 0, 1);
      assert.strictEqual(sliced.frames.length, 2);
      return utils.encodeGifAsync(sliced, { cancelMessage: "Export cancelled." }).then(function (bytes) {
        assert.ok(bytes.length > 20);
        console.log("ok - video-like RGBA frames slice then encode once");
      });
    })
    .then(function () {
      var cancelled = false;
      return utils
        .encodeGifAsync(
          {
            width: 2,
            height: 2,
            frames: [{ pixels: pixels, delayCs: 8 }]
          },
          {
            isCancelled: function () {
              return true;
            },
            cancelMessage: "Conversion cancelled."
          }
        )
        .then(function () {
          throw new Error("expected cancellation");
        })
        .catch(function (err) {
          if (/expected cancellation/.test(err.message)) {
            throw err;
          }
          assert.strictEqual(err.message, "Conversion cancelled.");
          cancelled = true;
          console.log("ok - encodeGifAsync uses custom cancel message");
        })
        .then(function () {
          assert.strictEqual(cancelled, true);
        });
    })
    .catch(function (err) {
      console.error("fail - async gif-slicer checks");
      console.error(err && err.stack ? err.stack : err);
      process.exitCode = 1;
    });
}

runAsyncChecks().then(function () {
  if (!process.exitCode) {
    console.log("All gif-slicer smoke checks passed.");
  }
});
