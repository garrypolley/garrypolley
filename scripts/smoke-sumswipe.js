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
  assert.strictEqual(utils.letterValue("M"), 13);
  assert.strictEqual(utils.letterValue(""), 0);
});

check("wordSum and reverseWord", function () {
  assert.strictEqual(utils.wordSum("CAT"), 24);
  assert.strictEqual(utils.reverseWord("CAT"), "TAC");
  assert.strictEqual(utils.reverseWord("level"), "LEVEL");
});

check("areAdjacent and isValidPath", function () {
  assert.strictEqual(utils.areAdjacent(5, 5, 4), false);
  assert.strictEqual(utils.areAdjacent(5, 0, 4), true);
  assert.strictEqual(utils.isValidPath([0, 1, 2], 4), true);
  assert.strictEqual(utils.isValidPath([0, 1, 0], 4), false);
  assert.strictEqual(utils.isValidPath([0, 2], 4), false);
});

check("resolvePathWord accepts forward or reverse swipe", function () {
  var grid = utils.flattenGrid(["CATS", "XXXX"]);
  // C-A-T forward
  var fwd = utils.resolvePathWord(grid, [0, 1, 2]);
  assert.strictEqual(fwd.word, "CAT");
  assert.strictEqual(fwd.reversed, false);

  // T-A-C reverse swipe still yields CAT
  var rev = utils.resolvePathWord(grid, [2, 1, 0]);
  assert.strictEqual(rev.word, "CAT");
  assert.strictEqual(rev.reversed, true);

  var bad = utils.resolvePathWord(grid, [0, 1]);
  assert.strictEqual(bad.word, "");
});

check("date helpers round-trip and shift", function () {
  assert.strictEqual(utils.formatDateKey(new Date(2026, 7, 8)), "2026-08-08");
  assert.strictEqual(utils.shiftDateKey("2026-08-08", -1), "2026-08-07");
  assert.strictEqual(utils.shiftDateKey("2026-08-08", 1), "2026-08-09");
  assert.strictEqual(utils.parseDateKey("2026-13-01"), null);
});

check("tiers map ratios", function () {
  assert.strictEqual(utils.tierForRatio(0).id, "starter");
  assert.strictEqual(utils.tierForRatio(0.25).id, "bronze");
  assert.strictEqual(utils.tierForRatio(0.5).id, "silver");
  assert.strictEqual(utils.tierForRatio(0.75).id, "gold");
  assert.strictEqual(utils.tierForRatio(1).id, "perfect");
  assert.strictEqual(utils.tierForScore(50, 200).id, "bronze");
  assert.strictEqual(utils.tierForScore(200, 200).id, "perfect");
});

check("daily grid is deterministic and has a solvable word set", function () {
  var a = utils.generateGrid("2026-08-08", 4);
  var b = utils.generateGrid("2026-08-08", 4);
  assert.deepStrictEqual(a.grid, b.grid);
  assert.strictEqual(a.maxScore, b.maxScore);
  assert.ok(a.wordCount >= 5, "expected a playable word count, got " + a.wordCount);
  assert.ok(a.maxScore > 0);
  assert.strictEqual(a.grid.length, 16);

  var other = utils.generateGrid("2026-08-09", 4);
  assert.notDeepStrictEqual(a.grid, other.grid);

  a.words.forEach(function (w) {
    assert.ok(utils.isDictionaryWord(w), w);
    assert.strictEqual(utils.wordSum(w) > 0, true);
  });
  assert.strictEqual(utils.scoreWords(a.words), a.maxScore);
});

check("sanitizeFoundWords filters junk", function () {
  var valid = { CAT: true, DOG: true };
  var cleaned = utils.sanitizeFoundWords(["cat", "DOG", "NOPE", "cat", ""], valid);
  assert.deepStrictEqual(cleaned, ["CAT", "DOG"]);
});

check("findAllWords on a known tiny grid", function () {
  var grid = utils.flattenGrid(["CATS", "DOGX", "XXXX", "XXXX"]);
  var sol = utils.findAllWords(grid, 4);
  assert.ok(sol.words.indexOf("CAT") !== -1);
  assert.ok(sol.words.indexOf("DOG") !== -1);
  assert.ok(sol.maxScore >= utils.wordSum("CAT") + utils.wordSum("DOG"));
});

if (!process.exitCode) {
  console.log("All SumSwipe smoke tests passed.");
}
