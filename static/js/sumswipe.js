/**
 * SumSwipe — daily 5×5 fill-the-board word puzzle.
 * Swipe paths to claim cells with dictionary words (A=1…Z=26). Goal: all 25 cells.
 * Pure helpers exported for smoke tests.
 */
var SumSwipeUtils = (function () {
  "use strict";

  var MIN_WORD_LEN = 3;
  var MAX_WORD_LEN = 8;
  var GRID_SIZE = 5;
  /** Bonus multiplier when all cells are claimed. */
  var FILL_BONUS = 0.15;
  /** How far back day navigation may go from today. */
  var MAX_HISTORY_DAYS = 365;
  /** Target extra words on generated grids (best-effort). */
  var TARGET_WORD_COUNT = 15;
  /** Generator retry budget per day. */
  var GENERATOR_ATTEMPTS = 80;

  var puzzleCache = {};

  function letterValue(ch) {
    if (typeof ch !== "string" || ch.length === 0) {
      return 0;
    }
    var code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) {
      return 0;
    }
    return code - 64;
  }

  function wordSum(word) {
    if (typeof word !== "string") {
      return 0;
    }
    var total = 0;
    for (var i = 0; i < word.length; i++) {
      total += letterValue(word.charAt(i));
    }
    return total;
  }

  /** Length factor: 3→1, 4→1.15, 5→1.35, 6→1.6, 7+→1.9 */
  function lengthFactor(len) {
    var n = parseInt(len, 10);
    if (!n || n < MIN_WORD_LEN) {
      return 0;
    }
    if (n === 3) {
      return 1;
    }
    if (n === 4) {
      return 1.15;
    }
    if (n === 5) {
      return 1.35;
    }
    if (n === 6) {
      return 1.6;
    }
    return 1.9;
  }

  function wordPoints(word) {
    var w = normalizeWord(word);
    if (!w) {
      return 0;
    }
    return Math.round(wordSum(w) * lengthFactor(w.length));
  }

  function scoreWordsWithFill(entries, claimedCount, size) {
    var total = 0;
    if (!Array.isArray(entries)) {
      return 0;
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry) {
        continue;
      }
      if (typeof entry.points === "number") {
        total += entry.points;
      } else if (entry.word) {
        total += wordPoints(entry.word);
      }
    }
    var cells = (size || GRID_SIZE) * (size || GRID_SIZE);
    if (claimedCount >= cells) {
      total = Math.round(total * (1 + FILL_BONUS));
    }
    return total;
  }

  function normalizeWord(word) {
    if (typeof word !== "string") {
      return "";
    }
    return word.toUpperCase().replace(/[^A-Z]/g, "");
  }

  function reverseWord(word) {
    return normalizeWord(word).split("").reverse().join("");
  }

  function indexToRowCol(index, size) {
    return { row: Math.floor(index / size), col: index % size };
  }

  function rowColToIndex(row, col, size) {
    return row * size + col;
  }

  function areAdjacent(a, b, size) {
    var pa = indexToRowCol(a, size);
    var pb = indexToRowCol(b, size);
    var dr = Math.abs(pa.row - pb.row);
    var dc = Math.abs(pa.col - pb.col);
    if (dr === 0 && dc === 0) {
      return false;
    }
    return dr <= 1 && dc <= 1;
  }

  /**
   * How a tap/click on `index` should affect an existing path.
   * start | extend | backtrack | noop | restart
   * Sliding back to the previous tile undoes (backtrack), not reuse.
   * Non-adjacent taps start a new path.
   */
  function pathTapAction(path, index, size) {
    if (!Array.isArray(path) || path.length === 0) {
      return "start";
    }
    var last = path[path.length - 1];
    if (index === last) {
      return "noop";
    }
    if (path.length >= 2 && index === path[path.length - 2]) {
      return "backtrack";
    }
    if (path.indexOf(index) !== -1) {
      return "noop";
    }
    if (areAdjacent(last, index, size)) {
      return "extend";
    }
    return "restart";
  }

  /**
   * Focus index after keyboard Backspace pops the path end.
   * Returns null when the path is empty afterward.
   */
  function focusAfterBackspace(pathAfterPop) {
    if (!Array.isArray(pathAfterPop) || pathAfterPop.length === 0) {
      return null;
    }
    return pathAfterPop[pathAfterPop.length - 1];
  }

  /**
   * Whether a pointer-up should count toward double-tap submit.
   * Path-changing gestures never count. Jitter on the path end still counts.
   */
  function countsTowardDoubleTap(opts) {
    var gestureChangedPath = !!(opts && opts.gestureChangedPath);
    var dragMoved = !!(opts && opts.dragMoved);
    var onPathEnd = !!(opts && opts.onPathEnd);
    if (gestureChangedPath) {
      return false;
    }
    if (dragMoved && !onPathEnd) {
      return false;
    }
    return true;
  }

  /**
   * Detect a double-tap on the same index within the window.
   */
  function isDoubleTap(now, lastTime, lastIndex, index, windowMs) {
    if (index < 0 || lastIndex < 0) {
      return false;
    }
    return now - lastTime <= windowMs && index === lastIndex;
  }

  function isValidPath(indices, size) {
    if (!Array.isArray(indices) || indices.length === 0) {
      return false;
    }
    var seen = {};
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (typeof idx !== "number" || idx !== idx || idx < 0 || idx >= size * size) {
        return false;
      }
      if (seen[idx]) {
        return false;
      }
      seen[idx] = true;
      if (i > 0) {
        if (indices[i - 1] === idx) {
          return false;
        }
        if (!areAdjacent(indices[i - 1], idx, size)) {
          return false;
        }
      }
    }
    return true;
  }

  function isCellClaimed(claimed, index) {
    return !!(claimed && claimed[index]);
  }

  function countClaimed(claimed) {
    var n = 0;
    if (!claimed) {
      return 0;
    }
    for (var key in claimed) {
      if (Object.prototype.hasOwnProperty.call(claimed, key) && claimed[key]) {
        n++;
      }
    }
    return n;
  }

  function claimPath(claimed, path) {
    if (!claimed || !Array.isArray(path)) {
      return claimed || {};
    }
    for (var i = 0; i < path.length; i++) {
      claimed[path[i]] = true;
    }
    return claimed;
  }

  function pathUsesClaimed(path, claimed) {
    if (!Array.isArray(path) || !claimed) {
      return false;
    }
    for (var i = 0; i < path.length; i++) {
      if (isCellClaimed(claimed, path[i])) {
        return true;
      }
    }
    return false;
  }

  function rebuildClaimedFromFound(found) {
    var claimed = {};
    if (!Array.isArray(found)) {
      return claimed;
    }
    for (var i = 0; i < found.length; i++) {
      var path = found[i] && found[i].path;
      if (Array.isArray(path)) {
        claimPath(claimed, path);
      }
    }
    return claimed;
  }

  function pathToWord(grid, indices) {
    if (!Array.isArray(grid) || !Array.isArray(indices)) {
      return "";
    }
    var out = "";
    for (var i = 0; i < indices.length; i++) {
      var ch = grid[indices[i]];
      if (typeof ch !== "string") {
        return "";
      }
      out += ch;
    }
    return normalizeWord(out);
  }

  function flattenGrid(rows) {
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        out.push(String(row.charAt ? row.charAt(c) : row[c]).toUpperCase());
      }
    }
    return out;
  }

  var DICTIONARY = {};
  var WORDS_BY_LENGTH = {};
  var DICTIONARY_READY = false;
  var DICTIONARY_META = {
    source: "",
    wordCount: 0,
  };

  function setDictionaryWords(words) {
    DICTIONARY = {};
    WORDS_BY_LENGTH = {};
    var count = 0;
    if (!Array.isArray(words)) {
      DICTIONARY_READY = false;
      DICTIONARY_META.wordCount = 0;
      return 0;
    }
    for (var i = 0; i < words.length; i++) {
      var w = normalizeWord(words[i]);
      if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) {
        continue;
      }
      if (DICTIONARY[w]) {
        continue;
      }
      DICTIONARY[w] = true;
      if (!WORDS_BY_LENGTH[w.length]) {
        WORDS_BY_LENGTH[w.length] = [];
      }
      WORDS_BY_LENGTH[w.length].push(w);
      count++;
    }
    DICTIONARY_READY = count > 0;
    DICTIONARY_META.wordCount = count;
    return count;
  }

  function parseDictionaryText(text) {
    var lines = String(text || "").split(/\r?\n/);
    var words = [];
    for (var i = 0; i < lines.length; i++) {
      var w = normalizeWord(lines[i]);
      if (w.length >= MIN_WORD_LEN && w.length <= MAX_WORD_LEN) {
        words.push(w);
      }
    }
    return words;
  }

  function loadDictionaryFromText(text, source) {
    var n = setDictionaryWords(parseDictionaryText(text));
    DICTIONARY_META.source = source || "custom";
    clearPuzzleCache();
    return n;
  }

  /** Sync load for Node smoke tests / tooling. No-op in the browser. */
  function ensureDictionaryLoadedSync() {
    if (DICTIONARY_READY) {
      return true;
    }
    if (typeof require === "undefined") {
      return false;
    }
    try {
      var fs = require("fs");
      var pathMod = require("path");
      var file = pathMod.join(__dirname, "..", "data", "sumswipe-words.txt");
      var text = fs.readFileSync(file, "utf8");
      loadDictionaryFromText(text, "ENABLE (Public Domain)");
      return DICTIONARY_READY;
    } catch (err) {
      return false;
    }
  }

  function isDictionaryReady() {
    return DICTIONARY_READY;
  }

  function getDictionaryMeta() {
    return {
      source: DICTIONARY_META.source,
      wordCount: DICTIONARY_META.wordCount,
      ready: DICTIONARY_READY,
    };
  }

  function isDictionaryWord(word) {
    ensureDictionaryLoadedSync();
    var w = normalizeWord(word);
    if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) {
      return false;
    }
    return !!DICTIONARY[w];
  }

  /**
   * Resolve a swiped path to a dictionary word.
   * Accepts the forward spelling or the reverse (swipe either direction).
   * If both are valid and different, prefer the forward swipe.
   */
  function resolvePathWord(grid, indices) {
    var forward = pathToWord(grid, indices);
    var backward = reverseWord(forward);
    var forwardOk = isDictionaryWord(forward);
    var backwardOk = isDictionaryWord(backward);
    if (forwardOk) {
      return { word: forward, reversed: false };
    }
    if (backwardOk) {
      return { word: backward, reversed: true };
    }
    return { word: "", reversed: false, attempted: forward };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashDateKey(dateKey) {
    var h = 2166136261;
    for (var i = 0; i < dateKey.length; i++) {
      h ^= dateKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function formatDateKey(date) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return (
      y +
      "-" +
      (m < 10 ? "0" : "") +
      m +
      "-" +
      (d < 10 ? "0" : "") +
      d
    );
  }

  function parseDateKey(dateKey) {
    var parts = String(dateKey).split("-");
    if (parts.length !== 3) {
      return null;
    }
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!y || !m || !d) {
      return null;
    }
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      return null;
    }
    return dt;
  }

  function shiftDateKey(dateKey, deltaDays) {
    var dt = parseDateKey(dateKey);
    if (!dt) {
      return dateKey;
    }
    dt.setDate(dt.getDate() + deltaDays);
    return formatDateKey(dt);
  }

  function todayKey(now) {
    return formatDateKey(now || new Date());
  }

  function shuffleInPlace(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function canPartition(remaining, minLen, maxLen, memo) {
    if (remaining === 0) {
      return true;
    }
    if (remaining < minLen) {
      return false;
    }
    if (memo[remaining] !== undefined) {
      return memo[remaining];
    }
    for (var L = minLen; L <= maxLen && L <= remaining; L++) {
      if (canPartition(remaining - L, minLen, maxLen, memo)) {
        memo[remaining] = true;
        return true;
      }
    }
    memo[remaining] = false;
    return false;
  }

  function randomPartition(total, minLen, maxLen, rand) {
    var result = [];
    var memo = {};
    function tryPart(remaining) {
      if (remaining === 0) {
        return true;
      }
      if (remaining < minLen) {
        return false;
      }
      var options = [];
      for (var L = minLen; L <= maxLen && L <= remaining; L++) {
        if (canPartition(remaining - L, minLen, maxLen, memo)) {
          options.push(L);
        }
      }
      if (!options.length) {
        return false;
      }
      shuffleInPlace(options, rand);
      for (var i = 0; i < options.length; i++) {
        var len = options[i];
        if (tryPart(remaining - len)) {
          result.push(len);
          return true;
        }
      }
      return false;
    }
    if (!tryPart(total)) {
      return null;
    }
    return result;
  }

  function findPathOfLength(start, size, blocked, len, rand) {
    var path = [start];
    var inPath = {};
    inPath[start] = true;
    var found = null;

    function dfs(idx) {
      if (found) {
        return;
      }
      if (path.length === len) {
        found = path.slice();
        return;
      }
      var neighbors = [];
      var cells = size * size;
      for (var j = 0; j < cells; j++) {
        if (!blocked[j] && !inPath[j] && areAdjacent(idx, j, size)) {
          neighbors.push(j);
        }
      }
      shuffleInPlace(neighbors, rand);
      for (var k = 0; k < neighbors.length; k++) {
        var next = neighbors[k];
        path.push(next);
        inPath[next] = true;
        dfs(next);
        if (found) {
          return;
        }
        path.pop();
        delete inPath[next];
      }
    }

    dfs(start);
    return found;
  }

  function pickRandomPath(size, blocked, len, rand) {
    var cells = size * size;
    var starts = [];
    for (var i = 0; i < cells; i++) {
      if (!blocked[i]) {
        starts.push(i);
      }
    }
    shuffleInPlace(starts, rand);
    for (var s = 0; s < starts.length; s++) {
      var path = findPathOfLength(starts[s], size, blocked, len, rand);
      if (path) {
        return path;
      }
    }
    return null;
  }

  function buildSeedGrid(size, rand, partitionOverride) {
    var partition =
      partitionOverride ||
      randomPartition(size * size, MIN_WORD_LEN, MAX_WORD_LEN, rand);
    if (!partition) {
      return null;
    }
    if (!partitionOverride) {
      shuffleInPlace(partition, rand);
    }

    var blocked = {};
    var grid = new Array(size * size);
    var seedWords = [];

    for (var p = 0; p < partition.length; p++) {
      var wordLen = partition[p];
      var path = pickRandomPath(size, blocked, wordLen, rand);
      if (!path) {
        return null;
      }
      var candidates = WORDS_BY_LENGTH[wordLen];
      if (!candidates || !candidates.length) {
        return null;
      }
      var word = candidates[Math.floor(rand() * candidates.length)];
      for (var i = 0; i < wordLen; i++) {
        grid[path[i]] = word.charAt(i);
        blocked[path[i]] = true;
      }
      seedWords.push({ word: word, path: path.slice() });
    }

    return { grid: grid, seedWords: seedWords };
  }

  function buildSeedGridDescending(size, rand) {
    var partition = randomPartition(size * size, MIN_WORD_LEN, MAX_WORD_LEN, rand);
    if (!partition) {
      return null;
    }
    partition.sort(function (a, b) {
      return b - a;
    });
    return buildSeedGrid(size, rand, partition);
  }

  var FALLBACK_PARTITIONS = [
    [5, 5, 5, 5, 5],
    [8, 8, 5, 4],
    [8, 7, 5, 5],
    [6, 6, 6, 4, 3],
    [4, 4, 4, 4, 4, 5],
    [3, 3, 3, 4, 4, 4, 4],
  ];

  function seedCoversAllCells(seedWords, size) {
    var claimed = {};
    if (!Array.isArray(seedWords)) {
      return false;
    }
    for (var i = 0; i < seedWords.length; i++) {
      var path = seedWords[i] && seedWords[i].path;
      if (!Array.isArray(path)) {
        return false;
      }
      for (var j = 0; j < path.length; j++) {
        claimed[path[j]] = true;
      }
    }
    return countClaimed(claimed) === size * size;
  }

  function generateGrid(dateKey, size) {
    if (!ensureDictionaryLoadedSync() && !DICTIONARY_READY) {
      throw new Error("SumSwipe: dictionary not loaded");
    }
    size = size || GRID_SIZE;
    var cacheKey = dateKey + ":" + size;
    if (puzzleCache[cacheKey]) {
      return puzzleCache[cacheKey];
    }

    var rand = mulberry32(hashDateKey(dateKey + ":grid"));
    var best = null;

    for (var attempt = 0; attempt < GENERATOR_ATTEMPTS; attempt++) {
      var built = buildSeedGrid(size, rand);
      if (!built) {
        built = buildSeedGridDescending(size, rand);
      }
      if (!built || !seedCoversAllCells(built.seedWords, size)) {
        continue;
      }
      var solution = findAllWords(built.grid, size);
      if (!solution.words.length) {
        continue;
      }
      if (!best || solution.words.length > best.solution.words.length) {
        best = {
          grid: built.grid,
          solution: solution,
          seedWords: built.seedWords,
        };
      }
      if (solution.words.length >= TARGET_WORD_COUNT) {
        break;
      }
    }

    if (!best) {
      for (var f = 0; f < FALLBACK_PARTITIONS.length; f++) {
        for (var fb = 0; fb < 30; fb++) {
          var fallbackBuilt = buildSeedGrid(size, rand, FALLBACK_PARTITIONS[f].slice());
          if (!fallbackBuilt || !seedCoversAllCells(fallbackBuilt.seedWords, size)) {
            continue;
          }
          var fallbackSolution = findAllWords(fallbackBuilt.grid, size);
          if (!fallbackSolution.words.length) {
            continue;
          }
          if (!best || fallbackSolution.words.length > best.solution.words.length) {
            best = {
              grid: fallbackBuilt.grid,
              solution: fallbackSolution,
              seedWords: fallbackBuilt.seedWords,
            };
          }
          if (fallbackSolution.words.length >= TARGET_WORD_COUNT) {
            break;
          }
        }
        if (best && best.solution.words.length >= TARGET_WORD_COUNT) {
          break;
        }
      }
    }

    if (!best) {
      throw new Error("SumSwipe: failed to generate puzzle for " + dateKey);
    }

    var rows = [];
    for (var r = 0; r < size; r++) {
      rows.push(best.grid.slice(r * size, r * size + size).join(""));
    }

    var puzzle = {
      dateKey: dateKey,
      size: size,
      grid: best.grid.slice(),
      rows: rows,
      words: best.solution.words.slice(),
      wordCount: best.solution.words.length,
      seedWords: best.seedWords,
      cellCount: size * size,
    };
    puzzleCache[cacheKey] = puzzle;
    return puzzle;
  }

  function findAllWords(grid, size) {
    ensureDictionaryLoadedSync();
    var found = {};
    var neighbors = [];
    var i;
    for (i = 0; i < grid.length; i++) {
      neighbors[i] = [];
      for (var j = 0; j < grid.length; j++) {
        if (areAdjacent(i, j, size)) {
          neighbors[i].push(j);
        }
      }
    }

    function dfs(idx, used, letters) {
      if (letters.length >= MIN_WORD_LEN && letters.length <= MAX_WORD_LEN) {
        if (DICTIONARY[letters]) {
          found[letters] = true;
        }
      }
      if (letters.length >= MAX_WORD_LEN) {
        return;
      }
      var nexts = neighbors[idx];
      for (var n = 0; n < nexts.length; n++) {
        var next = nexts[n];
        if (used[next]) {
          continue;
        }
        used[next] = true;
        dfs(next, used, letters + grid[next]);
        delete used[next];
      }
    }

    for (i = 0; i < grid.length; i++) {
      var used = {};
      used[i] = true;
      dfs(i, used, grid[i]);
    }

    var words = Object.keys(found).sort();
    return {
      words: words,
      wordCount: words.length,
    };
  }

  /**
   * Normalize saved finds to [{ word, path, points }, ...] without overlaps.
   */
  function sanitizeFoundEntries(raw, grid, size, validSet) {
    var claimed = {};
    var out = [];
    if (!Array.isArray(raw)) {
      return { found: [], claimed: claimed };
    }
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (!item || !item.word) {
        continue;
      }
      var w = normalizeWord(item.word);
      if (!isDictionaryWord(w)) {
        continue;
      }
      if (validSet && !validSet[w]) {
        continue;
      }
      var path = item.path;
      if (!Array.isArray(path) || !isValidPath(path, size)) {
        continue;
      }
      if (pathUsesClaimed(path, claimed)) {
        continue;
      }
      var resolved = resolvePathWord(grid, path);
      if (resolved.word !== w) {
        continue;
      }
      var pts = wordPoints(w);
      claimPath(claimed, path);
      out.push({ word: w, path: path.slice(), points: pts });
    }
    out.sort(function (a, b) {
      return a.word.localeCompare(b.word);
    });
    return { found: out, claimed: claimed };
  }

  function earliestDateKey(now) {
    return shiftDateKey(todayKey(now), -MAX_HISTORY_DAYS);
  }

  function clearPuzzleCache() {
    puzzleCache = {};
  }

  return {
    MIN_WORD_LEN: MIN_WORD_LEN,
    MAX_WORD_LEN: MAX_WORD_LEN,
    GRID_SIZE: GRID_SIZE,
    FILL_BONUS: FILL_BONUS,
    MAX_HISTORY_DAYS: MAX_HISTORY_DAYS,
    TARGET_WORD_COUNT: TARGET_WORD_COUNT,
    GENERATOR_ATTEMPTS: GENERATOR_ATTEMPTS,
    letterValue: letterValue,
    wordSum: wordSum,
    lengthFactor: lengthFactor,
    wordPoints: wordPoints,
    scoreWordsWithFill: scoreWordsWithFill,
    normalizeWord: normalizeWord,
    reverseWord: reverseWord,
    indexToRowCol: indexToRowCol,
    rowColToIndex: rowColToIndex,
    areAdjacent: areAdjacent,
    pathTapAction: pathTapAction,
    focusAfterBackspace: focusAfterBackspace,
    countsTowardDoubleTap: countsTowardDoubleTap,
    isDoubleTap: isDoubleTap,
    isValidPath: isValidPath,
    isCellClaimed: isCellClaimed,
    countClaimed: countClaimed,
    claimPath: claimPath,
    pathUsesClaimed: pathUsesClaimed,
    rebuildClaimedFromFound: rebuildClaimedFromFound,
    pathToWord: pathToWord,
    flattenGrid: flattenGrid,
    isDictionaryWord: isDictionaryWord,
    isDictionaryReady: isDictionaryReady,
    getDictionaryMeta: getDictionaryMeta,
    loadDictionaryFromText: loadDictionaryFromText,
    ensureDictionaryLoadedSync: ensureDictionaryLoadedSync,
    resolvePathWord: resolvePathWord,
    mulberry32: mulberry32,
    hashDateKey: hashDateKey,
    formatDateKey: formatDateKey,
    parseDateKey: parseDateKey,
    shiftDateKey: shiftDateKey,
    todayKey: todayKey,
    earliestDateKey: earliestDateKey,
    randomPartition: randomPartition,
    generateGrid: generateGrid,
    findAllWords: findAllWords,
    sanitizeFoundEntries: sanitizeFoundEntries,
    clearPuzzleCache: clearPuzzleCache,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SumSwipeUtils;
}

(function () {
  "use strict";

  if (typeof document === "undefined") {
    return;
  }

  var root = document.getElementById("sumSwipeTool");
  if (!root) {
    return;
  }

  var utils = SumSwipeUtils;
  /** Stable key; older versioned keys are migrated in. */
  var storageKey = "sumswipe-progress";
  var legacyStorageKeys = [
    "sumswipe-daily-v6",
    "sumswipe-daily-v5",
    "sumswipe-daily-v4",
  ];

  var state = {
    dateKey: utils.todayKey(),
    puzzle: null,
    validSet: {},
    found: [],
    claimed: {},
    path: [],
    dragging: false,
    pointerId: null,
    dragMoved: false,
    dragStartX: 0,
    dragStartY: 0,
    gestureChangedPath: false,
    gestureStartLen: 0,
    lastTapTime: 0,
    lastTapIndex: -1,
    focusIndex: 0,
  };

  var els = {
    title: document.getElementById("ssTitle"),
    blurb: document.getElementById("ssBlurb"),
    progress: document.getElementById("ssProgress"),
    grid: document.getElementById("ssGrid"),
    pathSvg: document.getElementById("ssPathSvg"),
    pathBubble: document.getElementById("ssPathBubble"),
    liveWord: document.getElementById("ssLiveWord"),
    liveSum: document.getElementById("ssLiveSum"),
    liveEq: document.getElementById("ssLiveEq"),
    scoreValue: document.getElementById("ssScoreValue"),
    fillValue: document.getElementById("ssFillValue"),
    fillMax: document.getElementById("ssFillMax"),
    fillBar: document.getElementById("ssFillBar"),
    foundList: document.getElementById("ssFoundList"),
    foundCount: document.getElementById("ssFoundCount"),
    historyList: document.getElementById("ssHistoryList"),
    status: document.getElementById("ssStatus"),
    prev: document.getElementById("ssPrev"),
    next: document.getElementById("ssNext"),
    today: document.getElementById("ssToday"),
    clear: document.getElementById("ssClear"),
    submit: document.getElementById("ssSubmit"),
    reset: document.getElementById("ssResetPuzzle"),
  };

  function readStorageObject(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      var data = JSON.parse(raw);
      return data && typeof data === "object" && !Array.isArray(data) ? data : null;
    } catch (e) {
      return null;
    }
  }

  function dayHasProgress(entry) {
    return !!(entry && Array.isArray(entry.found) && entry.found.length);
  }

  /** Prefer the richer / more complete of two day records. */
  function preferDayRecord(a, b) {
    if (!dayHasProgress(a)) {
      return b;
    }
    if (!dayHasProgress(b)) {
      return a;
    }
    var aClaimed = typeof a.claimedCount === "number" ? a.claimedCount : a.found.length;
    var bClaimed = typeof b.claimedCount === "number" ? b.claimedCount : b.found.length;
    if (bClaimed !== aClaimed) {
      return bClaimed > aClaimed ? b : a;
    }
    var aScore = typeof a.score === "number" ? a.score : 0;
    var bScore = typeof b.score === "number" ? b.score : 0;
    if (bScore !== aScore) {
      return bScore > aScore ? b : a;
    }
    var aAt = typeof a.updatedAt === "number" ? a.updatedAt : 0;
    var bAt = typeof b.updatedAt === "number" ? b.updatedAt : 0;
    return bAt >= aAt ? b : a;
  }

  function loadAllProgress() {
    var merged = {};
    var keys = legacyStorageKeys.concat([storageKey]);
    var i;
    var key;
    var data;
    var dateKey;
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      data = readStorageObject(key);
      if (!data) {
        continue;
      }
      for (dateKey in data) {
        if (!Object.prototype.hasOwnProperty.call(data, dateKey)) {
          continue;
        }
        if (!utils.parseDateKey(dateKey)) {
          continue;
        }
        merged[dateKey] = preferDayRecord(merged[dateKey], data[dateKey]);
      }
    }
    return merged;
  }

  function persistAllProgress(all) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(all));
    } catch (e) {
      // ignore quota / private mode
    }
  }

  function currentDayRecord() {
    var claimed = claimedCount();
    var total = cellTotal();
    return {
      found: state.found.slice(),
      claimedCount: claimed,
      score: currentScore(),
      completed: claimed >= total && total > 0,
      updatedAt: Date.now(),
    };
  }

  function saveProgress() {
    var all = loadAllProgress();
    if (!state.found.length) {
      delete all[state.dateKey];
    } else {
      all[state.dateKey] = currentDayRecord();
    }
    persistAllProgress(all);
  }

  function restoreProgress() {
    var all = loadAllProgress();
    var saved = all[state.dateKey];
    var raw = saved && Array.isArray(saved.found) ? saved.found : [];
    var cleaned = utils.sanitizeFoundEntries(
      raw,
      state.puzzle.grid,
      state.puzzle.size,
      state.validSet
    );
    state.found = cleaned.found;
    state.claimed = cleaned.claimed;
    // Refresh summary fields so history stays accurate after dictionary/grid changes.
    if (state.found.length) {
      all[state.dateKey] = currentDayRecord();
      persistAllProgress(all);
    }
  }

  function listHistoryDays() {
    var all = loadAllProgress();
    var earliest = utils.earliestDateKey();
    var today = utils.todayKey();
    var keys = [];
    var dateKey;
    for (dateKey in all) {
      if (!Object.prototype.hasOwnProperty.call(all, dateKey)) {
        continue;
      }
      if (dateKey < earliest || dateKey > today) {
        continue;
      }
      if (!dayHasProgress(all[dateKey])) {
        continue;
      }
      keys.push(dateKey);
    }
    keys.sort(function (a, b) {
      return a < b ? 1 : a > b ? -1 : 0;
    });
    return keys.map(function (key) {
      return { dateKey: key, record: all[key] };
    });
  }

  function renderHistory() {
    if (!els.historyList) {
      return;
    }
    els.historyList.innerHTML = "";
    var days = listHistoryDays();
    if (!days.length) {
      var empty = document.createElement("li");
      empty.className = "ss-history-empty";
      empty.textContent = "No saved days yet — progress stays in this browser.";
      els.historyList.appendChild(empty);
      return;
    }
    for (var i = 0; i < days.length; i++) {
      var item = days[i];
      var rec = item.record || {};
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-history-item";
      if (item.dateKey === state.dateKey) {
        btn.classList.add("is-current");
      }
      if (rec.completed) {
        btn.classList.add("is-complete");
      }
      btn.dataset.dateKey = item.dateKey;

      var dateEl = document.createElement("span");
      dateEl.className = "ss-history-date";
      dateEl.textContent = formatDisplayDate(item.dateKey);

      var stats = document.createElement("span");
      stats.className = "ss-history-stats";
      var claimed =
        typeof rec.claimedCount === "number"
          ? rec.claimedCount
          : Array.isArray(rec.found)
            ? rec.found.length
            : 0;
      var score = typeof rec.score === "number" ? rec.score : "—";
      var total = utils.GRID_SIZE * utils.GRID_SIZE;
      stats.textContent =
        claimed +
        "/" +
        total +
        " · " +
        score +
        " pts" +
        (rec.completed ? " · done" : "");

      btn.appendChild(dateEl);
      btn.appendChild(stats);
      btn.addEventListener("click", function (ev) {
        var key = ev.currentTarget.dataset.dateKey;
        if (key) {
          loadDay(key);
        }
      });
      li.appendChild(btn);
      els.historyList.appendChild(li);
    }
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.classList.remove("is-error", "is-success");
    if (kind === "error") {
      els.status.classList.add("is-error");
    } else if (kind === "success") {
      els.status.classList.add("is-success");
    }
  }

  function claimedCount() {
    return utils.countClaimed(state.claimed);
  }

  function cellTotal() {
    return state.puzzle ? state.puzzle.size * state.puzzle.size : utils.GRID_SIZE * utils.GRID_SIZE;
  }

  function currentScore() {
    return utils.scoreWordsWithFill(state.found, claimedCount(), state.puzzle.size);
  }

  function foundWordCount() {
    return state.found.length;
  }

  function hasFoundWord(word) {
    for (var i = 0; i < state.found.length; i++) {
      if (state.found[i].word === word) {
        return true;
      }
    }
    return false;
  }

  function addFound(word, path, points) {
    if (hasFoundWord(word)) {
      return "duplicate";
    }
    state.found.push({ word: word, path: path.slice(), points: points });
    utils.claimPath(state.claimed, path);
    state.found.sort(function (a, b) {
      return a.word.localeCompare(b.word);
    });
    return "added";
  }

  function formatDisplayDate(dateKey) {
    var dt = utils.parseDateKey(dateKey);
    if (!dt) {
      return dateKey;
    }
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function renderChrome() {
    var today = utils.todayKey();
    var score = currentScore();
    var claimed = claimedCount();
    var total = cellTotal();
    var fillRatio = total ? claimed / total : 0;

    els.title.textContent = "SumSwipe";
    els.blurb.textContent =
      "Daily puzzle for " +
      formatDisplayDate(state.dateKey) +
      ". Claim all 25 cells. Drag or tap letters — the path bubble shows your points.";
    els.progress.textContent =
      claimed + "/" + total + " cells · " + score + " pts";

    els.scoreValue.textContent = String(score);
    if (els.fillValue) {
      els.fillValue.textContent = String(claimed);
    }
    if (els.fillMax) {
      els.fillMax.textContent = String(total);
    }
    if (els.fillBar) {
      els.fillBar.style.width = Math.round(fillRatio * 1000) / 10 + "%";
      els.fillBar.dataset.fill = String(claimed);
      if (claimed >= total) {
        els.fillBar.classList.add("is-complete");
      } else {
        els.fillBar.classList.remove("is-complete");
      }
    }
    els.foundCount.textContent = String(foundWordCount());

    var earliest = utils.earliestDateKey();
    els.prev.disabled = state.dateKey <= earliest;
    els.next.disabled = state.dateKey >= today;
    els.today.disabled = state.dateKey === today;

    renderHistory();
  }

  function renderFound() {
    els.foundList.innerHTML = "";
    var entries = state.found.slice().sort(function (a, b) {
      return (b.points || 0) - (a.points || 0) || a.word.localeCompare(b.word);
    });
    if (!entries.length) {
      var empty = document.createElement("li");
      empty.className = "ss-found-empty";
      empty.textContent = "No words yet — swipe a path through open cells, or click letters and hit Submit.";
      els.foundList.appendChild(empty);
      return;
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var li = document.createElement("li");
      li.className = "ss-found-item";
      var w = document.createElement("span");
      w.className = "ss-found-word";
      w.textContent = entry.word;
      var pts = document.createElement("span");
      pts.className = "ss-found-pts";
      pts.textContent = "+" + (entry.points || utils.wordPoints(entry.word));
      li.appendChild(w);
      li.appendChild(pts);
      els.foundList.appendChild(li);
    }
  }

  function cellCenter(index) {
    var cell = els.grid.querySelector('[data-index="' + index + '"]');
    if (!cell) {
      return null;
    }
    var gridRect = els.grid.getBoundingClientRect();
    var r = cell.getBoundingClientRect();
    return {
      x: r.left - gridRect.left + r.width / 2,
      y: r.top - gridRect.top + r.height / 2,
    };
  }

  function drawPath() {
    var svg = els.pathSvg;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    if (state.path.length < 2) {
      return;
    }
    var d = "";
    for (var i = 0; i < state.path.length; i++) {
      var pt = cellCenter(state.path[i]);
      if (!pt) {
        continue;
      }
      d += (i === 0 ? "M" : "L") + pt.x + " " + pt.y + " ";
    }
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d.trim());
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(38, 96, 171, 0.9)");
    path.setAttribute("stroke-width", "7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }

  function pathIsReadyToSubmit() {
    if (!state.puzzle || state.path.length < utils.MIN_WORD_LEN) {
      return false;
    }
    if (!utils.isValidPath(state.path, state.puzzle.size)) {
      return false;
    }
    if (utils.pathUsesClaimed(state.path, state.claimed)) {
      return false;
    }
    var resolved = utils.resolvePathWord(state.puzzle.grid, state.path);
    if (!resolved.word || !state.validSet[resolved.word]) {
      return false;
    }
    if (hasFoundWord(resolved.word)) {
      return false;
    }
    return true;
  }

  function currentPathLiveStats() {
    var forward = utils.pathToWord(state.puzzle.grid, state.path);
    if (!forward) {
      return null;
    }
    var resolved = utils.resolvePathWord(state.puzzle.grid, state.path);
    var base = utils.wordSum(forward);
    var ready = pathIsReadyToSubmit();
    var displayWord = ready ? resolved.word : forward;
    var total = ready && resolved.word ? utils.wordPoints(resolved.word) : base;
    var factor = ready && resolved.word ? utils.lengthFactor(resolved.word.length) : null;
    return {
      forward: forward,
      resolved: resolved,
      displayWord: displayWord,
      base: base,
      total: total,
      factor: factor,
      ready: ready,
    };
  }

  function updatePathBubble(stats) {
    var bubble = els.pathBubble;
    if (!bubble) {
      return;
    }
    if (!stats || !state.path.length) {
      bubble.hidden = true;
      return;
    }
    var head = cellCenter(state.path[state.path.length - 1]);
    if (!head) {
      bubble.hidden = true;
      return;
    }
    bubble.hidden = false;
    bubble.classList.toggle("is-ready", !!stats.ready);
    if (stats.ready) {
      bubble.textContent = "+" + stats.total;
    } else if (stats.forward.length < utils.MIN_WORD_LEN) {
      bubble.textContent = String(stats.base);
    } else {
      bubble.textContent = stats.base + "…";
    }
    bubble.style.left = head.x + "px";
    bubble.style.top = head.y + "px";
  }

  function updateLive() {
    var stats = currentPathLiveStats();
    if (!stats) {
      els.liveWord.textContent = "—";
      els.liveSum.textContent = "—";
      els.liveEq.textContent =
        "Drag or tap letters · release swipe or tap last letter to play";
      updatePathBubble(null);
      return;
    }

    els.liveWord.textContent = stats.displayWord || "—";
    if (stats.resolved.word && stats.resolved.reversed && stats.forward) {
      els.liveWord.textContent = stats.resolved.word + " ← " + stats.forward;
    }

    if (stats.ready && stats.factor && stats.factor !== 1) {
      els.liveSum.textContent = stats.base + " ×" + stats.factor + " = " + stats.total;
    } else {
      els.liveSum.textContent = String(stats.total);
    }

    var parts = [];
    for (var i = 0; i < stats.forward.length; i++) {
      var ch = stats.forward.charAt(i);
      parts.push(ch + "(" + utils.letterValue(ch) + ")");
    }
    var msg = parts.join(" + ") + " = " + stats.base;
    if (stats.resolved.word && stats.resolved.reversed) {
      msg += " → " + stats.resolved.word;
    }
    if (stats.ready && stats.factor && stats.factor !== 1) {
      msg += " × " + stats.factor + " = " + stats.total;
    } else if (stats.ready) {
      msg += " → +" + stats.total;
    } else if (stats.forward.length >= utils.MIN_WORD_LEN) {
      msg += " · keep going or tap last letter if done";
    }
    els.liveEq.textContent = msg;
    updatePathBubble(stats);
  }

  function highlightPath() {
    var cells = els.grid.querySelectorAll(".ss-cell");
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove("is-path", "is-path-head", "is-focused");
    }
    for (var j = 0; j < state.path.length; j++) {
      var idx = state.path[j];
      var cell = els.grid.querySelector('[data-index="' + idx + '"]');
      if (!cell) {
        continue;
      }
      cell.classList.add("is-path");
      if (j === state.path.length - 1) {
        cell.classList.add("is-path-head");
      }
    }
    var focusCell = els.grid.querySelector('[data-index="' + state.focusIndex + '"]');
    if (focusCell) {
      focusCell.classList.add("is-focused");
    }
    drawPath();
    updateLive();
  }

  function setFocusIndex(index) {
    if (!state.puzzle) {
      return;
    }
    if (index < 0 || index >= state.puzzle.grid.length) {
      return;
    }
    state.focusIndex = index;
    var cell = els.grid.querySelector('[data-index="' + index + '"]');
    if (cell && typeof cell.focus === "function") {
      cell.focus();
    }
    highlightPath();
  }

  function clearPath() {
    state.path = [];
    clearTapMemory();
    highlightPath();
  }

  function syncSvgSize() {
    var rect = els.grid.getBoundingClientRect();
    els.pathSvg.setAttribute("width", String(rect.width));
    els.pathSvg.setAttribute("height", String(rect.height));
    els.pathSvg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    drawPath();
  }

  function renderGrid() {
    var p = state.puzzle;
    els.grid.style.setProperty("--ss-size", String(p.size));
    els.grid.innerHTML = "";
    els.grid.setAttribute(
      "aria-label",
      "SumSwipe daily grid for " + state.dateKey + ". Arrow keys move, Space adds, Enter submits."
    );

    for (var i = 0; i < p.grid.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-cell";
      if (state.claimed[i]) {
        btn.classList.add("is-claimed");
      }
      btn.dataset.index = String(i);
      btn.setAttribute(
        "aria-label",
        "Letter " + p.grid[i] + ", value " + utils.letterValue(p.grid[i])
      );
      btn.tabIndex = i === state.focusIndex ? 0 : -1;
      var letter = document.createElement("span");
      letter.className = "ss-cell-letter";
      letter.textContent = p.grid[i];
      var val = document.createElement("span");
      val.className = "ss-cell-value";
      val.textContent = String(utils.letterValue(p.grid[i]));
      btn.appendChild(letter);
      btn.appendChild(val);
      btn.addEventListener("focus", function (ev) {
        var idx = parseInt(ev.currentTarget.dataset.index, 10);
        if (!isNaN(idx)) {
          state.focusIndex = idx;
          highlightPath();
        }
      });
      els.grid.appendChild(btn);
    }

    requestAnimationFrame(syncSvgSize);
    highlightPath();
  }

  function loadDay(dateKey) {
    var today = utils.todayKey();
    var earliest = utils.earliestDateKey();
    if (dateKey > today) {
      dateKey = today;
    }
    if (dateKey < earliest) {
      dateKey = earliest;
    }
    state.dateKey = dateKey;
    state.puzzle = utils.generateGrid(dateKey, utils.GRID_SIZE);
    state.validSet = {};
    for (var i = 0; i < state.puzzle.words.length; i++) {
      state.validSet[state.puzzle.words[i]] = true;
    }
    state.found = [];
    state.claimed = {};
    state.path = [];
    state.dragging = false;
    state.pointerId = null;
    state.dragMoved = false;
    state.gestureChangedPath = false;
    state.lastTapTime = 0;
    state.lastTapIndex = -1;
    state.focusIndex = 0;
    restoreProgress();
    renderChrome();
    renderGrid();
    renderFound();
    updateLive();
    var isToday = state.dateKey === utils.todayKey();
    setStatus(
      (isToday ? "Today’s grid" : "This day’s grid") +
        " · claim all " +
        cellTotal() +
        " cells."
    );
  }

  function celebrateFullFill() {
    root.classList.add("ss-celebrate");
    setTimeout(function () {
      root.classList.remove("ss-celebrate");
    }, 900);
  }

  function tryCommitPath() {
    if (
      !utils.isValidPath(state.path, state.puzzle.size) ||
      state.path.length < utils.MIN_WORD_LEN
    ) {
      clearPath();
      return;
    }

    if (utils.pathUsesClaimed(state.path, state.claimed)) {
      setStatus("That path uses cells you already claimed.", "error");
      clearPath();
      return;
    }

    var resolved = utils.resolvePathWord(state.puzzle.grid, state.path);
    var attempted = utils.pathToWord(state.puzzle.grid, state.path);

    if (!resolved.word) {
      setStatus('"' + attempted + '" isn’t a word (try the other direction too).', "error");
      clearPath();
      return;
    }

    if (!state.validSet[resolved.word]) {
      setStatus(resolved.word + " isn’t on this grid.", "error");
      clearPath();
      return;
    }

    if (hasFoundWord(resolved.word)) {
      setStatus("Already claimed with " + resolved.word + ".", "error");
      clearPath();
      return;
    }

    var pts = utils.wordPoints(resolved.word);
    addFound(resolved.word, state.path, pts);
    saveProgress();
    renderChrome();
    renderGrid();
    renderFound();
    clearPath();

    var note = resolved.reversed ? " (reverse)" : "";
    var full = claimedCount() >= cellTotal();
    if (full) {
      setStatus(
        "Board filled! " + resolved.word + " +" + pts + note + " · " + currentScore() + " pts (+15% bonus)",
        "success"
      );
      celebrateFullFill();
    } else {
      setStatus(
        resolved.word + " +" + pts + note + " · " + claimedCount() + "/" + cellTotal() + " cells",
        "success"
      );
    }
  }

  /** Prefer nearest cell center within a generous radius (helps finger gaps). */
  function indexFromPoint(clientX, clientY) {
    var gridRect = els.grid.getBoundingClientRect();
    if (
      clientX < gridRect.left - 8 ||
      clientX > gridRect.right + 8 ||
      clientY < gridRect.top - 8 ||
      clientY > gridRect.bottom + 8
    ) {
      return -1;
    }

    var cells = els.grid.querySelectorAll(".ss-cell");
    if (!cells.length) {
      return -1;
    }
    var cellRect = cells[0].getBoundingClientRect();
    var radius = Math.max(cellRect.width, cellRect.height) * 0.62;
    var best = -1;
    var bestDist = radius * radius;

    for (var i = 0; i < cells.length; i++) {
      var r = cells[i].getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var dist = dx * dx + dy * dy;
      if (dist <= bestDist) {
        bestDist = dist;
        best = parseInt(cells[i].dataset.index, 10);
      }
    }
    return best;
  }

  var DOUBLE_TAP_MS = 600;
  var DRAG_MOVE_PX = 18;

  function extendPath(index) {
    if (index < 0 || index >= state.puzzle.grid.length) {
      return;
    }
    if (utils.isCellClaimed(state.claimed, index) && state.path.indexOf(index) === -1) {
      return;
    }
    if (state.path.length === 0) {
      if (utils.isCellClaimed(state.claimed, index)) {
        return;
      }
      state.path.push(index);
      state.focusIndex = index;
      highlightPath();
      return;
    }
    var last = state.path[state.path.length - 1];
    if (index === last) {
      return;
    }
    if (state.path.length >= 2 && index === state.path[state.path.length - 2]) {
      state.path.pop();
      state.focusIndex = state.path[state.path.length - 1];
      highlightPath();
      return;
    }
    if (!utils.areAdjacent(last, index, state.puzzle.size)) {
      return;
    }
    if (state.path.indexOf(index) !== -1) {
      return;
    }
    if (utils.isCellClaimed(state.claimed, index)) {
      return;
    }
    if (state.path.length >= utils.MAX_WORD_LEN) {
      return;
    }
    state.path.push(index);
    state.focusIndex = index;
    highlightPath();
  }

  function applyTapToPath(index) {
    var action = utils.pathTapAction(state.path, index, state.puzzle.size);

    // Tap the current end again to play the word (no helper button needed).
    if (action === "noop" && pathIsReadyToSubmit()) {
      tryCommitPath();
      return;
    }

    // Starting a new selection elsewhere auto-submits a ready word first.
    if (action === "restart") {
      if (pathIsReadyToSubmit()) {
        tryCommitPath();
      } else if (state.path.length) {
        clearPath();
      }
      clearTapMemory();
      extendPath(index);
      return;
    }

    if (action === "noop") {
      state.focusIndex = index;
      highlightPath();
      return;
    }
    extendPath(index);
  }

  function endDrag() {
    if (!state.dragging) {
      return;
    }
    state.dragging = false;
    state.pointerId = null;
  }

  function pathEndIndex() {
    if (!state.path.length) {
      return -1;
    }
    return state.path[state.path.length - 1];
  }

  function canSubmitPath() {
    return state.path.length >= utils.MIN_WORD_LEN;
  }

  function clearTapMemory() {
    state.lastTapTime = 0;
    state.lastTapIndex = -1;
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) {
      return;
    }
    if (state.dragging) {
      return;
    }
    var index = indexFromPoint(e.clientX, e.clientY);
    if (index < 0) {
      return;
    }
    e.preventDefault();

    state.dragging = true;
    state.pointerId = e.pointerId;
    state.dragMoved = false;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.gestureChangedPath = false;
    state.gestureStartLen = state.path.length;
    if (els.grid.setPointerCapture) {
      try {
        els.grid.setPointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
    }
    var beforeLen = state.path.length;
    var beforeJoin = state.path.join(",");
    applyTapToPath(index);
    if (state.path.join(",") !== beforeJoin || state.path.length !== beforeLen) {
      if (state.path.length) {
        state.gestureChangedPath = true;
      }
    }
  }

  function onPointerMove(e) {
    if (!state.dragging) {
      return;
    }
    if (state.pointerId != null && e.pointerId !== state.pointerId) {
      return;
    }
    e.preventDefault();
    var dx = e.clientX - state.dragStartX;
    var dy = e.clientY - state.dragStartY;
    if (dx * dx + dy * dy >= DRAG_MOVE_PX * DRAG_MOVE_PX) {
      state.dragMoved = true;
    }
    var index = indexFromPoint(e.clientX, e.clientY);
    if (index >= 0) {
      var before = state.path.join(",");
      extendPath(index);
      if (state.path.join(",") !== before) {
        state.gestureChangedPath = true;
      }
    }
  }

  function onPointerUp(e) {
    if (!state.dragging) {
      return;
    }
    if (state.pointerId != null && e.pointerId !== state.pointerId) {
      return;
    }
    var dragMoved = state.dragMoved;
    var gestureChangedPath = state.gestureChangedPath;
    if (els.grid.releasePointerCapture && state.pointerId != null) {
      try {
        els.grid.releasePointerCapture(state.pointerId);
      } catch (err) {
        // ignore
      }
    }
    endDrag();

    // Swipe release plays the word when valid; otherwise keep the path.
    if (dragMoved && gestureChangedPath && canSubmitPath() && pathIsReadyToSubmit()) {
      clearTapMemory();
      tryCommitPath();
    }
  }

  function onWindowPointerUp(e) {
    if (!state.dragging) {
      return;
    }
    if (state.pointerId != null && e.pointerId !== state.pointerId) {
      return;
    }
    onPointerUp(e);
  }

  els.grid.addEventListener("pointerdown", onPointerDown);
  els.grid.addEventListener("pointermove", onPointerMove);
  els.grid.addEventListener("pointerup", onPointerUp);
  els.grid.addEventListener("pointercancel", onPointerUp);
  els.grid.addEventListener("lostpointercapture", function () {
    if (state.dragging) {
      endDrag();
    }
  });
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);

  els.grid.addEventListener(
    "touchmove",
    function (e) {
      if (state.dragging) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  els.prev.addEventListener("click", function () {
    var prev = utils.shiftDateKey(state.dateKey, -1);
    var earliest = utils.earliestDateKey();
    if (prev < earliest) {
      prev = earliest;
    }
    loadDay(prev);
  });
  els.next.addEventListener("click", function () {
    var today = utils.todayKey();
    var next = utils.shiftDateKey(state.dateKey, 1);
    if (next > today) {
      next = today;
    }
    loadDay(next);
  });
  els.today.addEventListener("click", function () {
    loadDay(utils.todayKey());
  });
  els.clear.addEventListener("click", function () {
    clearPath();
    setStatus("Path cleared.");
  });
  if (els.submit) {
    els.submit.addEventListener("click", function () {
      if (!canSubmitPath()) {
        setStatus("Build a path of at least " + utils.MIN_WORD_LEN + " letters first.");
        return;
      }
      clearTapMemory();
      tryCommitPath();
    });
  }
  els.reset.addEventListener("click", function () {
    state.found = [];
    state.claimed = {};
    saveProgress();
    clearPath();
    renderChrome();
    renderGrid();
    renderFound();
    setStatus("Day’s progress cleared.");
  });

  function moveFocus(dr, dc) {
    var size = state.puzzle.size;
    var pos = utils.indexToRowCol(state.focusIndex, size);
    var row = Math.max(0, Math.min(size - 1, pos.row + dr));
    var col = Math.max(0, Math.min(size - 1, pos.col + dc));
    setFocusIndex(utils.rowColToIndex(row, col, size));
    // Keep roving tabindex on the focused cell.
    var cells = els.grid.querySelectorAll(".ss-cell");
    for (var i = 0; i < cells.length; i++) {
      cells[i].tabIndex = -1;
    }
    var focusCell = els.grid.querySelector('[data-index="' + state.focusIndex + '"]');
    if (focusCell) {
      focusCell.tabIndex = 0;
      focusCell.focus();
    }
  }

  els.grid.addEventListener("keydown", function (e) {
    if (state.dragging) {
      return;
    }
    var key = e.key;
    if (key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1, 0);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1, 0);
    } else if (key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(0, -1);
    } else if (key === "ArrowRight") {
      e.preventDefault();
      moveFocus(0, 1);
    } else if (key === " " || key === "Spacebar") {
      e.preventDefault();
      extendPath(state.focusIndex);
    } else if (key === "Enter") {
      e.preventDefault();
      if (state.path.length >= utils.MIN_WORD_LEN) {
        tryCommitPath();
      } else {
        extendPath(state.focusIndex);
      }
    } else if (key === "Backspace") {
      e.preventDefault();
      if (state.path.length) {
        state.path.pop();
        state.lastTapTime = 0;
        state.lastTapIndex = -1;
        var focus = utils.focusAfterBackspace(state.path);
        if (focus == null) {
          highlightPath();
        } else {
          setFocusIndex(focus);
        }
      }
    } else if (key === "Escape") {
      e.preventDefault();
      clearPath();
      setStatus("Path cleared.");
    }
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      syncSvgSize();
      highlightPath();
    }, 100);
  });

  function startGame() {
    loadDay(utils.todayKey());
  }

  setStatus("Loading dictionary…");
  fetch("/data/sumswipe-words.txt")
    .then(function (res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      return res.text();
    })
    .then(function (text) {
      var n = utils.loadDictionaryFromText(text, "ENABLE (Public Domain)");
      if (!n) {
        throw new Error("empty dictionary");
      }
      startGame();
    })
    .catch(function () {
      setStatus(
        "Could not load the word dictionary. Refresh and try again.",
        "error"
      );
    });
})();
