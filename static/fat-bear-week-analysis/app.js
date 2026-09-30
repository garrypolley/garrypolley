const STAGES = ["Open", "Day2", "Mid", "Late/Semi", "Finals"];

const COLORS = {
  "2022": "#c46a5a",
  "2023": "#8a9080",
  "2024": "#c4924a",
  "2025": "#7fad6a",
  "2026": "#6b9e8a",
  guide: "#9aa58a",
  warn: "#c4924a",
  danger: "#c46a5a",
};

const VS_OPENER = {
  2022: [100, 102.7, 59.4, 70.2, 114.2],
  2023: [100, 97.3, 51.6, 70.5, 90.3],
  2024: [100, 88.7, 44.0, 69.5, 89.4],
  2025: [100, 112.0, 81.0, 73.8, 101.6],
  2026: [100, 80.4, 64.0, 74.0, 98.6],
};

const YOY = [
  { name: "2023 vs 2022", year: "2023", data: [133.0, 126.0, 115.5, 133.5, 105.1] },
  { name: "2024 vs 2023", year: "2024", data: [78.1, 71.2, 66.6, 77.0, 77.4] },
  { name: "2025 vs 2024", year: "2025", data: [138.6, 175.0, 255.2, 147.2, 157.5] },
  { name: "2026 vs 2025", year: "2026", data: [129.7, 93.1, 102.5, 130.1, 125.9] },
];

const GAPS = {
  2022: {
    labels: ["2022-10-05", "2022-10-06", "2022-10-07", "2022-10-08"],
    data: [1.6, 6.1, 2.4, 0.6],
  },
  2023: {
    labels: ["2023-10-04", "2023-10-05", "2023-10-06", "2023-10-07", "2023-10-09"],
    data: [7.8, 9.6, 2.7, 3.9, 1.3],
  },
  2024: {
    labels: ["2024-10-02", "2024-10-03", "2024-10-04", "2024-10-05", "2024-10-07"],
    data: [4.3, 2.7, 3.7, 2.4, 1.2],
  },
  2025: {
    labels: ["2025-09-23", "2025-09-24", "2025-09-25", "2025-09-26", "2025-09-29"],
    data: [1.6, 1.7, 2.5, 2.9, 4.8],
  },
  2026: {
    labels: ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"],
    data: [16.4, 3.7, 2.3, 5.7],
  },
};

const FINALS_YEARS = ["2022", "2023", "2024", "2025", "2026"];
const FINALS_MARGINS = [11229, 85187, 40780, 32625, 5081];
const FINALS_MARGIN_PCT = [9.0, 64.8, 40.1, 20.4, 2.5];
/** Winner votes ÷ pair total — 50% = coin flip */
const FINALS_WINNER_PCT = [54.5, 82.4, 70.0, 60.2, 51.3];
/** Median margin % of pair across adult-bracket matchups that year */
const ADULT_MEDIAN_MARGIN_PCT = [35.3, 64.8, 51.3, 40.4, 50.3];

let charts = {
  opener: null,
  yoy: null,
  gaps: null,
  marginVotes: null,
  marginPct: null,
  winnerPct: null,
  adultMedian: null,
};

function guideLine(label, n) {
  return {
    type: "line",
    label,
    data: Array(n).fill(100),
    borderColor: COLORS.guide,
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 0,
    tension: 0,
    order: 0,
  };
}

function baseOptions(yTitle, xRotate) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: "#e8edd9",
          boxWidth: 12,
          font: { family: "DM Sans" },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#9aa58a",
          maxRotation: xRotate ? 90 : 0,
          minRotation: xRotate ? 45 : 0,
          font: { family: "DM Sans", size: xRotate ? 10 : 11 },
        },
        grid: { color: "rgba(44,53,38,0.7)" },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: yTitle,
          color: "#9aa58a",
          font: { family: "DM Sans", size: 12 },
        },
        ticks: { color: "#9aa58a", font: { family: "DM Sans" } },
        grid: { color: "rgba(44,53,38,0.7)" },
      },
    },
  };
}

function destroyCharts() {
  Object.keys(charts).forEach((k) => {
    if (charts[k]) {
      charts[k].destroy();
      charts[k] = null;
    }
  });
}

function marginOptions(yTitle) {
  const opts = baseOptions(yTitle);
  opts.plugins.legend = { display: false };
  return opts;
}

function renderMargins() {
  const yearColors = FINALS_YEARS.map((y) => COLORS[y]);

  charts.winnerPct = new Chart(document.getElementById("chartWinnerPct"), {
    type: "bar",
    data: {
      labels: FINALS_YEARS,
      datasets: [
        {
          label: "Winner share of pair",
          data: FINALS_WINNER_PCT,
          backgroundColor: yearColors,
        },
        {
          type: "line",
          label: "50% (coin flip)",
          data: Array(FINALS_YEARS.length).fill(50),
          borderColor: COLORS.guide,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: (() => {
      const opts = baseOptions("% of finals pair (winner)");
      opts.scales.y.min = 45;
      opts.scales.y.max = 90;
      return opts;
    })(),
  });

  charts.marginVotes = new Chart(document.getElementById("chartMarginVotes"), {
    type: "bar",
    data: {
      labels: FINALS_YEARS,
      datasets: [
        {
          label: "Margin (votes)",
          data: FINALS_MARGINS,
          backgroundColor: yearColors,
        },
      ],
    },
    options: marginOptions("Votes (winner − loser)"),
  });

  charts.marginPct = new Chart(document.getElementById("chartMarginPct"), {
    type: "bar",
    data: {
      labels: FINALS_YEARS,
      datasets: [
        {
          label: "Margin (% of pair)",
          data: FINALS_MARGIN_PCT,
          backgroundColor: yearColors,
        },
      ],
    },
    options: marginOptions("% of finals pair total"),
  });

  charts.adultMedian = new Chart(document.getElementById("chartAdultMedian"), {
    type: "bar",
    data: {
      labels: FINALS_YEARS,
      datasets: [
        {
          label: "Median adult margin %",
          data: ADULT_MEDIAN_MARGIN_PCT,
          backgroundColor: yearColors,
        },
        {
          type: "line",
          label: "10% (close race)",
          data: Array(FINALS_YEARS.length).fill(10),
          borderColor: COLORS.danger,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: baseOptions("Median margin % of pair (adult bracket)"),
  });
}

function render(view) {
  destroyCharts();
  renderMargins();
  const isAll = view === "all";
  const years = isAll ? ["2022", "2023", "2024", "2025", "2026"] : [view];

  document.getElementById("openerTitle").textContent = isAll
    ? "How busy vs opener (all years)"
    : `How busy vs opener (${view})`;

  document.getElementById("gapTitle").textContent = isAll
    ? "Same-day missing votes (all dates, oldest → newest)"
    : `Same-day missing votes (${view}, by date)`;

  const openerData = {
    labels: STAGES,
    datasets: [
      ...years.map((y) => ({
        label: y,
        data: VS_OPENER[y],
        backgroundColor: COLORS[y],
      })),
      guideLine("Same as opener", STAGES.length),
    ],
  };

  charts.opener = new Chart(document.getElementById("chartVsOpener"), {
    type: "bar",
    data: openerData,
    options: baseOptions("Index (that year's opener = 100)"),
  });

  const yoySection = document.getElementById("yoySection");
  const yoyEmpty = document.getElementById("yoyEmpty");
  const yoyRows = isAll ? YOY : YOY.filter((r) => r.year === view);

  if (yoyRows.length === 0) {
    yoySection.hidden = true;
    yoyEmpty.hidden = false;
  } else {
    yoySection.hidden = false;
    yoyEmpty.hidden = true;
    document.getElementById("yoyTitle").textContent = isAll
      ? "Year-over-year vs prior year"
      : `Year-over-year vs prior year (${view})`;

    charts.yoy = new Chart(document.getElementById("chartYoY"), {
      type: "bar",
      data: {
        labels: STAGES,
        datasets: [
          ...yoyRows.map((r) => ({
            label: r.name,
            data: r.data,
            backgroundColor: COLORS[r.year],
          })),
          guideLine("Same as prior year", STAGES.length),
        ],
      },
      options: baseOptions("Index (prior year same stage = 100)"),
    });
  }

  let gapLabels = [];
  let gapData = [];
  years.forEach((y) => {
    gapLabels = gapLabels.concat(GAPS[y].labels);
    gapData = gapData.concat(GAPS[y].data);
  });

  charts.gaps = new Chart(document.getElementById("chartGaps"), {
    type: "bar",
    data: {
      labels: gapLabels,
      datasets: [
        {
          label: "Gap as % of day's max pair",
          data: gapData,
          backgroundColor: COLORS.warn,
        },
        {
          type: "line",
          label: "10% flag",
          data: Array(gapLabels.length).fill(10),
          borderColor: COLORS.danger,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: baseOptions("Gap (% of max pair)", true),
  });
}

const select = document.getElementById("yearView");
select.addEventListener("change", () => render(select.value));
render("all");
