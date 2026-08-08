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
  assert.strictEqual(utils.letterValue("1"), 0);
  assert.strictEqual(utils.letterValue(""), 0);
});

check("wordSum adds letter values", function () {
  assert.strictEqual(utils.wordSum("CAT"), 24);
  assert.strictEqual(utils.wordSum("dog"), 26);
  assert.strictEqual(utils.wordSum("MATH"), 42);
  assert.strictEqual(utils.wordSum("PLUS"), 68);
  assert.strictEqual(utils.wordSum(""), 0);
});

check("normalizeWord strips non-letters and uppercases", function () {
  assert.strictEqual(utils.normalizeWord("  ca-t! "), "CAT");
  assert.strictEqual(utils.normalizeWord(null), "");
});

check("areAdjacent includes diagonals and rejects self", function () {
  // 4x4: index 5 is r1c1; neighbors include 0,1,2,4,6,8,9,10
  assert.strictEqual(utils.areAdjacent(5, 5, 4), false);
  assert.strictEqual(utils.areAdjacent(5, 0, 4), true);
  assert.strictEqual(utils.areAdjacent(5, 10, 4), true);
  assert.strictEqual(utils.areAdjacent(5, 7, 4), false);
});

check("isValidPath rejects reuse and jumps", function () {
  assert.strictEqual(utils.isValidPath([0, 1, 2], 4), true);
  assert.strictEqual(utils.isValidPath([0, 1, 0], 4), false);
  assert.strictEqual(utils.isValidPath([0, 2], 4), false);
  assert.strictEqual(utils.isValidPath([], 4), false);
  assert.strictEqual(utils.isValidPath([99], 4), false);
});

check("pathToWord and flattenGrid", function () {
  var grid = utils.flattenGrid(["CATS", "DOGU"]);
  assert.strictEqual(grid.length, 8);
  assert.strictEqual(utils.pathToWord(grid, [0, 1, 2]), "CAT");
  assert.strictEqual(utils.pathToWord(grid, [4, 5, 6]), "DOG");
});

check("dictionary accepts intended answers", function () {
  assert.strictEqual(utils.isDictionaryWord("CAT"), true);
  assert.strictEqual(utils.isDictionaryWord("FINGER"), true);
  assert.strictEqual(utils.isDictionaryWord("SWIPE"), true);
  assert.strictEqual(utils.isDictionaryWord("XYZXYZ"), false);
  assert.strictEqual(utils.isDictionaryWord("AB"), false);
});

check("puzzles have unique target sums and reachable answers", function () {
  function findPath(rows, word) {
    var size = rows.length;
    var grid = rows.join("").split("");
    var letters = word.toUpperCase().split("");

    function dfs(i, path) {
      if (i === letters.length) {
        return path;
      }
      for (var idx = 0; idx < grid.length; idx++) {
        if (grid[idx] !== letters[i]) {
          continue;
        }
        if (path.indexOf(idx) !== -1) {
          continue;
        }
        if (path.length) {
          var a = path[path.length - 1];
          var ar = Math.floor(a / size);
          var ac = a % size;
          var br = Math.floor(idx / size);
          var bc = idx % size;
          if (Math.abs(ar - br) > 1 || Math.abs(ac - bc) > 1) {
            continue;
          }
        }
        var found = dfs(i + 1, path.concat([idx]));
        if (found) {
          return found;
        }
      }
      return null;
    }

    return dfs(0, []);
  }

  var puzzles = utils.getPuzzles();
  assert.ok(puzzles.length >= 5);

  puzzles.forEach(function (p) {
    assert.strictEqual(p.grid.length, p.size * p.size);
    var seen = {};
    p.targets.forEach(function (t) {
      assert.strictEqual(seen[t.sum], undefined, p.id + " duplicate sum " + t.sum);
      seen[t.sum] = true;
      assert.strictEqual(utils.wordSum(t.answer), t.sum, p.id + " " + t.answer);
      assert.ok(utils.isDictionaryWord(t.answer), p.id + " dict " + t.answer);
      assert.ok(findPath(p.rows, t.answer), p.id + " path for " + t.answer);
    });
  });
});

if (!process.exitCode) {
  console.log("All SumSwipe smoke tests passed.");
}
