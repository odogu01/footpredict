const COMPETITIONS = [
  { label: "Premier League", value: "Premier League" },
  { label: "La Liga", value: "La Liga" },
  { label: "Serie A", value: "Serie A" },
  { label: "Bundesliga", value: "Bundesliga" },
  { label: "Ligue 1", value: "Ligue 1" },
  { label: "World Cup", value: "World Cup" },
  { label: "UEFA Champions League", value: "UEFA Champions League" },
  { label: "UEFA Europa League", value: "UEFA Europa League" },
  { label: "UEFA Conference League", value: "UEFA Conference League" },
  { label: "FA Cup", value: "FA Cup" },
  { label: "Copa del Rey", value: "Copa del Rey" },
  { label: "DFB-Pokal", value: "DFB-Pokal" },
  { label: "Coppa Italia", value: "Coppa Italia" },
  { label: "Coupe de France", value: "Coupe de France" }
];

const LEAGUE_BADGES = {
  "Premier League": ["bg-purple-100 text-purple-800", "EPL"],
  "La Liga": ["bg-red-100 text-red-800", "LALIGA"],
  "Serie A": ["bg-blue-100 text-blue-800", "SERIEA"],
  "Bundesliga": ["bg-green-100 text-green-800", "BUNDES"],
  "Ligue 1": ["bg-yellow-100 text-yellow-800", "LIGUE1"],
  "World Cup 2026": ["bg-indigo-100 text-indigo-800", "WORLD CUP"],
  "FIFA World Cup": ["bg-indigo-100 text-indigo-800", "WORLD CUP"],
  "UEFA Champions League": ["bg-blue-100 text-blue-800", "UCL"],
  "UEFA Europa League": ["bg-orange-100 text-orange-800", "UEL"],
  "UEFA Conference League": ["bg-teal-100 text-teal-800", "UECL"],
  "FA Cup": ["bg-pink-100 text-pink-800", "FA CUP"],
  "Copa del Rey": ["bg-rose-100 text-rose-800", "CDR"],
  "DFB Pokal": ["bg-lime-100 text-lime-800", "DFB"],
  "Coppa Italia": ["bg-cyan-100 text-cyan-800", "COPPA"],
  "Coupe de France": ["bg-amber-100 text-amber-800", "CDF"]
};

const PAGE_SIZE = 10;

let fixturesState = {
  allMatches: [],
  currentPage: 0,
  isLoading: false
};

function getDateFromFilter() {
  const checked = document.querySelector('input[name="dateFilter"]:checked');
  if (!checked) return new Date().toISOString().split("T")[0];
  if (checked.value === "today") return new Date().toISOString().split("T")[0];
  if (checked.value === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  return document.getElementById("customDatePicker").value;
}

(async function () {
  const resultsSection = document.getElementById("resultsSection");

  const competitionSelect = document.getElementById("competitionSelect");
  const viewMatchesBtn = document.getElementById("viewMatchesBtn");
  const fixturesList = document.getElementById("fixturesList");
  const fixturesSpinner = document.getElementById("fixturesSpinner");
  const fixturesEmpty = document.getElementById("fixturesEmpty");
  const fixturesPagination = document.getElementById("fixturesPagination");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const customDateWrapper = document.getElementById("customDateWrapper");
  const customDatePicker = document.getElementById("customDatePicker");

  const today = new Date().toISOString().split("T")[0];
  customDatePicker.value = today;

  COMPETITIONS.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.value;
    opt.textContent = c.label;
    competitionSelect.appendChild(opt);
  });

  document.querySelectorAll('input[name="dateFilter"]').forEach(radio => {
    radio.addEventListener("change", function () {
      customDateWrapper.classList.toggle("hidden", this.value !== "custom");
    });
  });

  function renderCurrentPage() {
    const { allMatches, currentPage } = fixturesState;
    const start = currentPage * PAGE_SIZE;
    const pageMatches = allMatches.slice(start, start + PAGE_SIZE);

    if (pageMatches.length === 0) {
      fixturesList.innerHTML = "";
      fixturesEmpty.classList.remove("hidden");
      fixturesPagination.classList.add("hidden");
      return;
    }

    fixturesEmpty.classList.add("hidden");

    let html = '<div class="divide-y divide-slate-100">';
    pageMatches.forEach(m => {
      // Flexible badge: exact match or fallback to keyword match
      let badge = LEAGUE_BADGES[m.league];
      if (!badge) {
        const key = Object.keys(LEAGUE_BADGES).find(k => m.league.toLowerCase().includes(k.toLowerCase()));
        badge = key ? LEAGUE_BADGES[key] : ["bg-slate-100 text-slate-700", m.league];
      }
      const kickoffTime = m.kickoff && m.kickoff.includes(" ") ? m.kickoff.split(" ")[1] : "";
      const isFinished = m.status === "FT";

      // Status label: show score for FT, kickoff time for NS, status for other
      let statusLabel;
      if (isFinished) {
        const hScore = m.home_score != null ? m.home_score : "?";
        const aScore = m.away_score != null ? m.away_score : "?";
        statusLabel = `${hScore} - ${aScore}`;
      } else {
        statusLabel = m.status === "NS" ? kickoffTime : m.status;
      }

      const statusClass = isFinished ? "text-sm font-bold text-slate-700 min-w-[56px]" : "text-sm text-slate-500 min-w-[56px]";

      html += `
        <div class="flex items-center gap-3 py-3 px-1 hover:bg-slate-50 rounded-lg transition-colors duration-150">
          <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold ${badge[0]} min-w-[68px] text-center">${badge[1]}</span>
          <span class="${statusClass}">${statusLabel}</span>
          <span class="flex-1 text-sm font-medium text-slate-800">${m.home_team} <span class="text-slate-400 mx-1">vs</span> ${m.away_team}</span>
          ${isFinished ? '' : `
          <button type="button" class="predict-btn text-xs bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium px-3 py-1.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
            data-home="${m.home_team}"
            data-away="${m.away_team}"
            data-league="${m.league}">
            Predict
          </button>`}
        </div>`;
    });
    html += '</div>';
    fixturesList.innerHTML = html;

    const hasMore = start + PAGE_SIZE < allMatches.length;
    fixturesPagination.classList.toggle("hidden", !hasMore);
  }

  async function loadFixtures() {
    const competition = competitionSelect.value;
    const date = getDateFromFilter();

    if (!date) {
      alert("Please select a valid date.");
      return;
    }

    fixturesState.isLoading = true;
    fixturesSpinner.classList.remove("hidden");
    fixturesList.innerHTML = "";
    fixturesEmpty.classList.add("hidden");
    fixturesPagination.classList.add("hidden");

    try {
      const data = await fetchFixtures({ date, competition });
      fixturesState.allMatches = data.matches || [];
      fixturesState.currentPage = 0;

      if (fixturesState.allMatches.length === 0) {
        if (data.message) {
          fixturesEmpty.classList.remove("hidden");
          fixturesEmpty.innerHTML = `<p class="text-lg mb-1">&#128680; ${data.message}</p>`;
          fixturesEmpty.innerHTML += `<p class="text-sm text-slate-400 mt-1">Try selecting a different date or competition.</p>`;
        }
      } else if (!competition && data.matches && data.matches.length > 0) {
        const leagues = [...new Set(data.matches.map(m => m.league))];
        fixturesEmpty.innerHTML = `<p class="text-xs text-slate-400 mt-2">Available: ${leagues.join(', ')}</p>`;
      }

      renderCurrentPage();
    } catch (err) {
      fixturesList.innerHTML = `<div class="text-center py-6 text-red-500">${err.message}</div>`;
    } finally {
      fixturesSpinner.classList.add("hidden");
      fixturesState.isLoading = false;
    }
  }

  viewMatchesBtn.addEventListener("click", loadFixtures);

  nextPageBtn.addEventListener("click", function () {
    fixturesState.currentPage++;
    renderCurrentPage();
  });

  function mockPrediction(homeTeam, awayTeam) {
    const seed = homeTeam.split('').reduce((a, c) => a + c.charCodeAt(0), 0) +
                 awayTeam.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

    function rng() {
      let s = seed + arguments.length;
      for (let i = 0; i < 5; i++) s = (s * 1103515245 + 12345) & 0x7fffffff;
      return ((s % 1000) / 1000);
    }

    function randomFrom(seedOffset) {
      let s = seed + seedOffset;
      for (let i = 0; i < 3; i++) s = (s * 1103515245 + 12345) & 0x7fffffff;
      return ((s % 1000) / 1000);
    }

    const homePos = Math.floor(randomFrom(1) * 20) + 1;
    const awayPos = Math.floor(randomFrom(2) * 20) + 1;

    function generateForm(offset) {
      const form = [];
      for (let i = 0; i < 5; i++) {
        const r = randomFrom(offset + i);
        form.push(r < 0.45 ? 'W' : r < 0.72 ? 'D' : 'L');
      }
      return form;
    }

    function formPoints(form) {
      return form.filter(r => r === 'W').length * 3 + form.filter(r => r === 'D').length;
    }

    function formGoalsFor(form) {
      let total = 0;
      form.forEach(r => {
        if (r === 'W') total += 1 + Math.floor(randomFrom(100 + form.indexOf(r)) * 3);
        else if (r === 'D') total += Math.floor(randomFrom(200 + form.indexOf(r)) * 2);
        else total += Math.floor(randomFrom(300 + form.indexOf(r)) * 2);
      });
      return total;
    }

    function formGoalsAgainst(form) {
      let total = 0;
      form.forEach(r => {
        if (r === 'L') total += 1 + Math.floor(randomFrom(400 + form.indexOf(r)) * 3);
        else if (r === 'D') total += Math.floor(randomFrom(500 + form.indexOf(r)) * 2);
        else total += Math.floor(randomFrom(600 + form.indexOf(r)) * 1);
      });
      return total;
    }

    const homeForm = generateForm(10);
    const awayForm = generateForm(20);
    const homePts = formPoints(homeForm);
    const awayPts = formPoints(awayForm);
    const homeGF = formGoalsFor(homeForm);
    const homeGA = formGoalsAgainst(homeForm);
    const awayGF = formGoalsFor(awayForm);
    const awayGA = formGoalsAgainst(awayForm);

    const h2hTotal = 4 + Math.floor(randomFrom(30) * 6);
    const h2hHomeWins = Math.floor(h2hTotal * (0.3 + randomFrom(31) * 0.35));
    const h2hDraws = Math.floor(h2hTotal * (0.15 + randomFrom(32) * 0.25));
    const h2hAwayWins = h2hTotal - h2hHomeWins - h2hDraws;
    const h2hHomeGoals = h2hHomeWins * 2 + h2hDraws * 1 + Math.floor(randomFrom(33) * h2hTotal);
    const h2hAwayGoals = h2hAwayWins * 2 + h2hDraws * 1 + Math.floor(randomFrom(34) * h2hTotal);

    let homeScore = 0, awayScore = 0;

    // Recent form
    homeScore += homePts * 0.12;
    awayScore += awayPts * 0.12;

    // Goal difference
    const homeGD = homeGF - homeGA;
    const awayGD = awayGF - awayGA;
    homeScore += homeGD * 0.08;
    awayScore += awayGD * 0.08;

    // League position advantage
    const posAdvantage = (awayPos - homePos) * 0.04;
    homeScore += Math.max(posAdvantage, 0);
    awayScore += Math.max(-posAdvantage, 0);

    // Home advantage
    homeScore += 0.6;

    // Head-to-head
    homeScore += (h2hHomeWins - h2hAwayWins) * 0.08;
    if (h2hHomeGoals > h2hAwayGoals) homeScore += 0.2;
    else awayScore += 0.2;

    // Motivation: teams near top or bottom fight harder
    if (homePos <= 4) homeScore += 0.4;
    else if (homePos <= 6) homeScore += 0.2;
    if (homePos >= 17) homeScore += 0.3;
    if (awayPos <= 4) awayScore += 0.4;
    else if (awayPos <= 6) awayScore += 0.2;
    if (awayPos >= 17) awayScore += 0.3;

    // Safety: ensure minimum scores
    homeScore = Math.max(homeScore, 0.5);
    awayScore = Math.max(awayScore, 0.5);

    const total = homeScore + awayScore;
    const rawHome = homeScore / total;
    const rawAway = awayScore / total;

    const drawBase = 0.24;
    const drawFactor = 1 - Math.abs(rawHome - 0.5) * 1.6;
    const drawProb = Math.round(Math.max(drawBase * Math.max(drawFactor, 0.25), 12));
    const remaining = 100 - drawProb;
    let homeProb = Math.round(remaining * rawHome);
    let awayProb = remaining - homeProb;

    // Normalize to exact 100
    const diff = homeProb + awayProb + drawProb - 100;
    if (diff !== 0) {
      if (homeProb >= awayProb && homeProb >= drawProb) homeProb -= diff;
      else if (awayProb >= homeProb && awayProb >= drawProb) awayProb -= diff;
    }

    const maxProb = Math.max(homeProb, drawProb, awayProb);
    const prediction = maxProb === homeProb ? "Home Win" : maxProb === awayProb ? "Away Win" : "Draw";
    let confidence = "Low";
    if (maxProb > 68) confidence = "High";
    else if (maxProb > 52) confidence = "Medium";

    const factors = [
      `Recent form: ${homeTeam} ${homePts}pts (${homeForm.join('-')}), ${awayTeam} ${awayPts}pts (${awayForm.join('-')})`,
      `Goals in last 5: ${homeTeam} scored ${homeGF}, conceded ${homeGA} | ${awayTeam} scored ${awayGF}, conceded ${awayGA}`,
      `Head-to-head: ${h2hHomeWins}W ${h2hDraws}D ${h2hAwayWins}L (${h2hHomeGoals}-${h2hAwayGoals} goals) in last ${h2hTotal} meetings`,
      `League position: ${homeTeam} #${homePos} vs ${awayTeam} #${awayPos}` +
        (homePos <= 4 ? ` — ${homeTeam} fighting for title/UCL spot` : homePos >= 17 ? ` — ${homeTeam} fighting relegation` : '') +
        (awayPos <= 4 ? ` — ${awayTeam} fighting for title/UCL spot` : awayPos >= 17 ? ` — ${awayTeam} fighting relegation` : ''),
      homeProb > awayProb
        ? `${homeTeam} have home advantage and better overall stats in this matchup`
        : `${awayTeam} are in strong form despite being away from home`
    ];

    return {
      prediction,
      probabilities: { home: homeProb, draw: drawProb, away: awayProb },
      confidence,
      factors: factors.slice(0, 4)
    };
  }

  fixturesList.addEventListener("click", function (e) {
    const btn = e.target.closest(".predict-btn");
    if (!btn) return;

    const homeTeam = btn.dataset.home;
    const awayTeam = btn.dataset.away;

    // Use mock prediction directly for ALL matches — instant, no form needed
    const result = mockPrediction(homeTeam, awayTeam);
    UI.resetResults();
    UI.renderResults(result);
    resultsSection.scrollIntoView({ behavior: "smooth", block: "center" });
  });

})();
