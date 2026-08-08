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
  // Tile 0 thrice and tile 1 twice → still 3×, not 6×
  assert.strictEqual(utils.pathMultiplier([0, 1, 0, 1, 0]), 3);
  assert.strictEqual(utils.wordPathScore("CAT", [0, 1, 0]), utils.wordSum("CAT") * 2);
});

check("isValidPath allows reuse up to 3, rejects consecutive same cell", function () {
  assert.strictEqual(utils.isValidPath([0, 1, 2], 4), true);
  assert.strictEqual(utils.isValidPath([0, 1, 0], 4), true);
  assert.strictEqual(utils.isValidPath([0, 0], 4), false);
  assert.strictEqual(utils.isValidPath([0, 2], 4), false);
  // 0 and 1 each used three times — ok
  assert.strictEqual(utils.isValidPath([0, 1, 0, 1, 0, 1], 4), true);
  // 0 used four times — over cap
  assert.strictEqual(utils.isValidPath([0, 1, 0, 1, 0, 1, 0], 4), false);
});

check("resolvePathWord accepts forward or reverse swipe", function () {
  var grid = utils.flattenGrid(["CATS", "XXXX"]);
  assert.strictEqual(utils.resolvePathWord(grid, [0, 1, 2]).word, "CAT");
  assert.strictEqual(utils.resolvePathWord(grid, [2, 1, 0]).word, "CAT");
  assert.strictEqual(utils.resolvePathWord(grid, [2, 1, 0]).reversed, true);
});

check("tiers and date helpers", function () {
  assert.strictEqual(utils.tierForScore(50, 200).id, "bronze");
  assert.strictEqual(utils.shiftDateKey("2026-08-08", -1), "2026-08-07");
});

check("sanitizeFoundWords keeps best multiplier and accepts legacy strings", function () {
  var valid = { CAT: true, DOG: true };
  var cleaned = utils.sanitizeFoundWords(
    ["cat", { word: "DOG", mult: 2 }, { word: "CAT", mult: 3 }, { word: "NOPE", mult: 2 }],
    valid
  );
  assert.deepStrictEqual(cleaned, [
    { word: "CAT", mult: 3 },
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

check("daily grid deterministic; maxScore includes best multipliers", function () {
  var a = utils.generateGrid("2026-08-08", 4);
  var b = utils.generateGrid("2026-08-08", 4);
  assert.deepStrictEqual(a.grid, b.grid);
  assert.strictEqual(a.maxScore, b.maxScore);
  assert.ok(a.wordCount >= 5, "wordCount " + a.wordCount);
  var expected = 0;
  a.words.forEach(function (w) {
    expected += utils.wordSum(w) * (a.bestMult[w] || 1);
  });
  assert.strictEqual(a.maxScore, expected);
});

check("findAllWords tracks reuse multipliers", function () {
  var grid = utils.flattenGrid(["CATS", "DOGX", "XXXX", "XXXX"]);
  var sol = utils.findAllWords(grid, 4);
  assert.ok(sol.words.indexOf("CAT") !== -1);
  assert.ok(sol.bestMult.CAT >= 1);
  assert.ok(sol.maxScore >= utils.wordSum("CAT") + utils.wordSum("DOG"));
});

if (!process.exitCode) {
  console.log("All SumSwipe smoke tests passed.");
}
