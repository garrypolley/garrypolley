#!/usr/bin/env node
"use strict";

/**
 * Build static/data/sumswipe-words.txt from the ENABLE word list (Public Domain).
 * Usage:
 *   node scripts/build-sumswipe-dict.js [/path/to/enable1.txt]
 * If no path is given, downloads enable1.txt from dolph/dictionary.
 */

var fs = require("fs");
var path = require("path");
var https = require("https");

var MIN = 3;
var MAX = 8;
var OUT = path.join(__dirname, "..", "static", "data", "sumswipe-words.txt");
var LICENSE_OUT = path.join(__dirname, "..", "static", "data", "SUMSWIPE-WORDS-LICENSE.txt");
var DEFAULT_URL =
  "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt";

function fetchText(url) {
  return new Promise(function (resolve, reject) {
    https
      .get(url, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error("HTTP " + res.statusCode + " for " + url));
          res.resume();
          return;
        }
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      })
      .on("error", reject);
  });
}

function filterWords(text) {
  var set = {};
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var w = lines[i].trim().toUpperCase();
    if (!/^[A-Z]+$/.test(w)) {
      continue;
    }
    if (w.length < MIN || w.length > MAX) {
      continue;
    }
    set[w] = true;
  }
  return Object.keys(set).sort();
}

function writeLicense() {
  var body =
    "SumSwipe word list\n" +
    "==================\n\n" +
    "Source: ENABLE (Enhanced North American Benchmark Lexicon) word list,\n" +
    "via https://github.com/dolph/dictionary (enable1.txt).\n\n" +
    "ENABLE / WORD.LST is released into the Public Domain by its authors.\n" +
    "Anyone is free to use or distribute it. Please credit ENABLE as the source.\n\n" +
    "This file retains only alphabetic words of length 3–8 for SumSwipe.\n";
  fs.writeFileSync(LICENSE_OUT, body);
}

function main() {
  var inputPath = process.argv[2];
  var ready = inputPath
    ? Promise.resolve(fs.readFileSync(inputPath, "utf8"))
    : fetchText(DEFAULT_URL);

  return ready.then(function (text) {
    var words = filterWords(text);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, words.join("\n") + "\n");
    writeLicense();
    console.log("Wrote " + words.length + " words to " + OUT);
    console.log("BLEAT included: " + (words.indexOf("BLEAT") !== -1));
  });
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
