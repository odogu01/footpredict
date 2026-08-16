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

  function showError(message) {
    fixturesList.innerHTML = `<div class="text-center py-6 text-red-500">${message}</div>`;
  }

  async function handlePredictClick(btn) {
    const homeTeam = btn.dataset.home;
    const awayTeam = btn.dataset.away;
    const league = btn.dataset.league || '';
    const matchDate = new Date().toISOString().split("T")[0];

    btn.disabled = true;
    btn.textContent = "Predicting...";
    btn.classList.add("opacity-50", "cursor-not-allowed");

    try {
      const result = await predictMatch({ homeTeam, awayTeam, league, matchDate });
      UI.resetResults();
      UI.renderResults(result);
      resultsSection.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      UI.resetResults();
      showError(`Prediction failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Predict";
      btn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  }

  fixturesList.addEventListener("click", function (e) {
    const btn = e.target.closest(".predict-btn");
    if (!btn) return;

    handlePredictClick(btn);
  });

  // ------------------------------------------------------------------
  // Teams view
  // ------------------------------------------------------------------
  const predictView = document.getElementById("predictView");
  const teamsView = document.getElementById("teamsView");
  const navPredict = document.getElementById("navPredict");
  const navTeams = document.getElementById("navTeams");
  const teamsLeagueSelect = document.getElementById("teamsLeagueSelect");
  const loadTeamsBtn = document.getElementById("loadTeamsBtn");
  const teamsSpinner = document.getElementById("teamsSpinner");
  const teamsEmpty = document.getElementById("teamsEmpty");
  const teamsList = document.getElementById("teamsList");

  // Populate league filter from the backend (real league names)
  (async function populateLeagueFilter() {
    try {
      const data = await fetchLeagues();
      (data.data || []).forEach(l => {
        const opt = document.createElement("option");
        opt.value = l.name;
        opt.textContent = l.name;
        teamsLeagueSelect.appendChild(opt);
      });
    } catch (err) {
      // fall back to known league names if the API is unreachable
      ["English Premier League", "Spanish La Liga", "Italian Serie A", "German Bundesliga", "French Ligue 1"].forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        teamsLeagueSelect.appendChild(opt);
      });
    }
  })();

  const NAV_ACTIVE = ["text-indigo-600", "border-b-2", "border-indigo-600"];
  const NAV_INACTIVE = ["hover:text-slate-800"];

  function setNav(active) {
    [navPredict, navTeams].forEach(n => {
      n.classList.remove(...NAV_ACTIVE, ...NAV_INACTIVE);
      n.classList.add(...NAV_INACTIVE);
    });
    const el = active === "predict" ? navPredict : navTeams;
    el.classList.remove(...NAV_INACTIVE);
    el.classList.add(...NAV_ACTIVE);
  }

  function showView(view) {
    const isPredict = view === "predict";
    predictView.classList.toggle("hidden", !isPredict);
    teamsView.classList.toggle("hidden", isPredict);
    UI.resetResults();
    setNav(view);
    window.scrollTo({ top: 0 });
  }

  navPredict.addEventListener("click", e => { e.preventDefault(); showView("predict"); });
  navTeams.addEventListener("click", e => { e.preventDefault(); showView("teams"); });

  function eloBadgeClass(elo) {
    if (elo >= 1700) return "bg-green-100 text-green-800";
    if (elo >= 1550) return "bg-blue-100 text-blue-800";
    if (elo >= 1450) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-700";
  }

  async function loadTeams() {
    const league = teamsLeagueSelect.value;
    teamsList.innerHTML = "";
    teamsEmpty.classList.add("hidden");
    teamsSpinner.classList.remove("hidden");

    try {
      const data = await fetchTeams({ league: league || undefined });
      const teams = data.data || [];

      if (teams.length === 0) {
        teamsEmpty.classList.remove("hidden");
        teamsEmpty.innerHTML = `<p class="text-lg">&#128680; No teams found.</p>`;
        return;
      }

      let html = '<div class="divide-y divide-slate-100">';
      teams.forEach((t, i) => {
        const eloColor = eloBadgeClass(t.elo_rating);
        html += `
          <div class="flex items-center gap-3 py-3 px-1 hover:bg-slate-50 rounded-lg transition-colors duration-150">
            <span class="w-8 text-right text-sm font-semibold text-slate-400">${i + 1}</span>
            <span class="flex-1 text-sm font-medium text-slate-800">${t.name}</span>
            ${t.league ? `<span class="text-xs text-slate-400 hidden sm:inline">${t.league}</span>` : ""}
            <span class="inline-block px-2 py-0.5 rounded text-xs font-bold ${eloColor} min-w-[64px] text-center">${t.elo_rating}</span>
          </div>`;
      });
      html += '</div>';
      teamsList.innerHTML = html;
    } catch (err) {
      teamsList.innerHTML = `<div class="text-center py-6 text-red-500">${err.message}</div>`;
    } finally {
      teamsSpinner.classList.add("hidden");
    }
  }

  loadTeamsBtn.addEventListener("click", loadTeams);

})();
