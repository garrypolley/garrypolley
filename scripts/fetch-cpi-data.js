#!/usr/bin/env node
/**
 * Refresh static/data/cpi-u-annual.json from the BLS Public Data API.
 *
 * Series: CUUR0000SA0 (CPI-U, U.S. city average, all items)
 * Period: M13 (annual average)
 *
 * Usage: node scripts/fetch-cpi-data.js
 *
 * Optional: BLS_API_KEY for higher rate limits (registration free at
 * https://data.bls.gov/registrationEngine/).
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const SERIES_ID = "CUUR0000SA0";
const START_YEAR = 1913;
const END_YEAR = new Date().getFullYear();
const OUT_PATH = path.join(__dirname, "..", "static", "data", "cpi-u-annual.json");

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`BLS HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function fetchRange(startYear, endYear) {
  const body = {
    seriesid: [SERIES_ID],
    startyear: String(startYear),
    endyear: String(endYear),
  };
  if (process.env.BLS_API_KEY) {
    body.registrationkey = process.env.BLS_API_KEY;
  }

  const json = await postJson("https://api.bls.gov/publicAPI/v2/timeseries/data/", body);
  if (json.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS status: ${json.status} ${JSON.stringify(json.message || [])}`);
  }

  const series = json.Results && json.Results.series && json.Results.series[0];
  if (!series || !Array.isArray(series.data)) {
    throw new Error("Unexpected BLS response shape");
  }

  const annual = {};
  for (const row of series.data) {
    if (row.period !== "M13") continue;
    const year = Number(row.year);
    const value = Number(row.value);
    if (!Number.isFinite(year) || !Number.isFinite(value)) continue;
    annual[year] = value;
  }
  return annual;
}

async function main() {
  const annual = {};
  // Unregistered BLS keys allow at most 10 years per request.
  for (let start = START_YEAR; start <= END_YEAR; start += 10) {
    const end = Math.min(start + 9, END_YEAR);
    const chunk = await fetchRange(start, end);
    Object.assign(annual, chunk);
    // Be polite to the public API.
    await new Promise((r) => setTimeout(r, 250));
  }

  const years = Object.keys(annual)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) {
    throw new Error("No annual CPI rows returned");
  }

  const payload = {
    source: "U.S. Bureau of Labor Statistics",
    seriesId: SERIES_ID,
    seriesTitle: "CPI-U All items, U.S. city average, not seasonally adjusted",
    unit: "index 1982-84=100",
    period: "annual average (M13)",
    fetchedAt: new Date().toISOString().slice(0, 10),
    api: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    docs: "https://www.bls.gov/cpi/",
    note: "Annual CPI-U averages from the BLS Public Data API. Earliest official annual average is 1913.",
    annual,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${years.length} years (${years[0]}–${years[years.length - 1]}) → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
