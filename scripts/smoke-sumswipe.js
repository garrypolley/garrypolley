#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static", "js", "sumswipe.js"));

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

check("letterValue maps A=1 through Z=26", function () {
  assert.strictEqual(utils.letterValue("A"), 1);
  assert.strictEqual(utils.letterValue("z"), 26);
});

check("pathMultiplier uses max single-tile visits, capped at 3, no stacking", function () {
  assert.strictEqual(utils.pathMultiplier([0, 1, 2]), 1);
  assert.strictEqual(utils.pathMultiplier([0, 1, 0]), 2);
  assert.strictEqual(utils.pathMultiplier([0, 1, 0, 1, 0]), 3);
  assert.strictEqual(utils.wordPathScore("CAT", [0, 1, 0]), utils.wordSum("CAT") * 2);
});

check("isValidPath allows reuse up to 3, rejects consecutive same cell", function () {
  assert.strictEqual(utils.isValidPath([0, 1, 2], 4), true);
  assert.strictEqual(utils.isValidPath([0, 1, 0], 4), true);
  assert.strictEqual(utils.isValidPath([0, 0], 4), false);
  assert.strictEqual(utils.isValidPath([0, 2], 4), false);
  assert.strictEqual(utils.isValidPath([0, 1, 0, 1, 0, 1], 4), true);
  assert.strictEqual(utils.isValidPath([0, 1, 0, 1, 0, 1, 0], 4), false);
});

check("resolvePathWord accepts forward or reverse swipe", function () {
  var grid = utils.flattenGrid(["CATS", "XXXX"]);
  assert.strictEqual(utils.resolvePathWord(grid, [0, 1, 2]).word, "CAT");
  assert.strictEqual(utils.resolvePathWord(grid, [2, 1, 0]).word, "CAT");
  assert.strictEqual(utils.resolvePathWord(grid, [2, 1, 0]).reversed, true);
});

check("pathTapAction extends adjacent clicks and ignores non-adjacent", function () {
  assert.strictEqual(utils.pathTapAction([], 0, 4), "start");
  assert.strictEqual(utils.pathTapAction([0], 0, 4), "noop");
  assert.strictEqual(utils.pathTapAction([0], 1, 4), "extend");
  assert.strictEqual(utils.pathTapAction([0, 1], 0, 4), "backtrack");
  assert.strictEqual(utils.pathTapAction([0], 3, 4), "ignore");
});

check("focusAfterBackspace tracks the new path head", function () {
  // Called with the path after pop().
  assert.strictEqual(utils.focusAfterBackspace([0, 1]), 1);
  assert.strictEqual(utils.focusAfterBackspace([0]), 0);
  assert.strictEqual(utils.focusAfterBackspace([]), null);
});

check("double-tap helpers forgive end jitter but not path-changing gestures", function () {
  assert.strictEqual(
    utils.countsTowardDoubleTap({
      gestureChangedPath: false,
      dragMoved: true,
      onPathEnd: true,
    }),
    true
  );
  assert.strictEqual(
    utils.countsTowardDoubleTap({
      gestureChangedPath: true,
      dragMoved: false,
      onPathEnd: true,
    }),
    false
  );
  assert.strictEqual(
    utils.countsTowardDoubleTap({
      gestureChangedPath: false,
      dragMoved: true,
      onPathEnd: false,
    }),
    false
  );
  assert.strictEqual(utils.isDoubleTap(1000, 600, 5, 5, 550), true);
  assert.strictEqual(utils.isDoubleTap(1000, 400, 5, 5, 550), false);
  assert.strictEqual(utils.isDoubleTap(1000, 900, 5, 4, 550), false);
});

check("log rating 0–9 and date helpers including history bound", function () {
  assert.strictEqual(utils.RATING_MAX, 9);
  assert.strictEqual(utils.ratingForScore(0, 200), 0);
  assert.strictEqual(utils.ratingForScore(200, 200), 9);
  assert.strictEqual(utils.ratingForScore(400, 200), 9);
  // ~50% of max → 8 on base-2 thresholds
  assert.strictEqual(utils.ratingForScore(100, 200), 8);
  // small fraction still unlocks early ratings
  assert.ok(utils.ratingForScore(2, 200) >= 1);
  assert.ok(utils.ratingForScore(2, 200) < 8);
  assert.ok(utils.ratingFillRatio(100, 200) > 0.8);
  assert.ok(utils.ratingFillRatio(100, 200) < 1);
  assert.strictEqual(utils.ratingFillRatio(200, 200), 1);
  assert.strictEqual(utils.shiftDateKey("2026-08-08", -1), "2026-08-07");
  var today = utils.todayKey(new Date(2026, 7, 8));
  assert.strictEqual(today, "2026-08-08");
  assert.strictEqual(utils.earliestDateKey(new Date(2026, 7, 8)), "2025-08-08");
  assert.strictEqual(utils.MAX_HISTORY_DAYS, 365);
});

check("sanitizeFoundWords clamps to bestMult and drops unknown words", function () {
  var valid = { CAT: true, DOG: true };
  var best = { CAT: 1, DOG: 2 };
  var cleaned = utils.sanitizeFoundWords(
    [
      "cat",
      { word: "DOG", mult: 3 },
      { word: "CAT", mult: 3 },
      { word: "NOPE", mult: 2 },
    ],
    valid,
    best
  );
  assert.deepStrictEqual(cleaned, [
    { word: "CAT", mult: 1 },
    { word: "DOG", mult: 2 },
  ]);
});

check("scoreFoundEntries applies multipliers", function () {
  assert.strictEqual(
    utils.scoreFoundEntries([
      { word: "CAT", mult: 2 },
      { word: "DOG", mult: 1 },
    ]),
    utils.wordSum("CAT") * 2 + utils.wordSum("DOG")
  );
});

check("daily grid deterministic; maxScore is base 1× total", function () {
  utils.clearPuzzleCache();
  var a = utils.generateGrid("2026-08-08", 4);
  var b = utils.generateGrid("2026-08-08", 4);
  assert.strictEqual(a, b, "cached puzzle object reused");
  assert.ok(a.wordCount >= 5, "wordCount " + a.wordCount);
  var base = 0;
  var boosted = 0;
  a.words.forEach(function (w) {
    base += utils.wordSum(w);
    boosted += utils.wordSum(w) * (a.bestMult[w] || 1);
  });
  assert.strictEqual(a.maxScore, base);
  assert.strictEqual(a.boostedScore, boosted);
  assert.ok(a.boostedScore >= a.maxScore);
});

check("unique-letter length-3 words stay at bestMult 1", function () {
  var grid = utils.flattenGrid(["CATS", "DOGX", "XXXX", "XXXX"]);
  var sol = utils.findAllWords(grid, 4);
  assert.ok(sol.words.indexOf("CAT") !== -1);
  assert.strictEqual(sol.bestMult.CAT, 1);
  assert.ok(sol.words.indexOf("DOG") !== -1);
  assert.strictEqual(sol.bestMult.DOG, 1);
});

check("findAllWords tracks reuse multipliers for repeat-letter words", function () {
  // M O M .
  // . . . .
  var grid = utils.flattenGrid(["MOMX", "XXXX", "XXXX", "XXXX"]);
  var sol = utils.findAllWords(grid, 4);
  assert.ok(sol.words.indexOf("MOM") !== -1);
  assert.ok(sol.bestMult.MOM >= 2, "MOM should allow tile reuse on M");
});

check("puzzle cache speeds repeat generateGrid", function () {
  utils.clearPuzzleCache();
  var t0 = Date.now();
  utils.generateGrid("2026-08-01", 4);
  var first = Date.now() - t0;
  var t1 = Date.now();
  utils.generateGrid("2026-08-01", 4);
  var second = Date.now() - t1;
  assert.ok(second < 20, "cached generate should be near-instant, got " + second + "ms (first " + first + "ms)");
});

if (!process.exitCode) {
  console.log("All SumSwipe smoke tests passed.");
}
