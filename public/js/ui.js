let probChartInstance = null;

const UI = {
  renderResults(result) {
    const section = document.getElementById("resultsSection");
    section.classList.remove("hidden");
    section.classList.add("block");
    section.scrollIntoView({ behavior: "smooth", block: "start" });

    const { prediction, probabilities, confidence, factors } = result;

    const outcomeBox = document.getElementById("outcomeBox");
    const bgMap = {
      "Home Win": "bg-green-100 border-green-500 text-green-900",
      "Draw": "bg-yellow-100 border-yellow-500 text-yellow-900",
      "Away Win": "bg-red-100 border-red-500 text-red-900"
    };
    outcomeBox.className = `border-l-4 p-4 rounded-lg ${bgMap[prediction]}`;
    outcomeBox.querySelector("h3").textContent = prediction;

    const homeBar = document.getElementById("probHomeBar");
    const drawBar = document.getElementById("probDrawBar");
    const awayBar = document.getElementById("probAwayBar");
    const homeLabel = document.getElementById("probHomeLabel");
    const drawLabel = document.getElementById("probDrawLabel");
    const awayLabel = document.getElementById("probAwayLabel");

    homeBar.style.width = probabilities.home + "%";
    homeBar.textContent = probabilities.home + "%";
    drawBar.style.width = probabilities.draw + "%";
    drawBar.textContent = probabilities.draw + "%";
    awayBar.style.width = probabilities.away + "%";
    awayBar.textContent = probabilities.away + "%";
    homeLabel.textContent = probabilities.home + "%";
    drawLabel.textContent = probabilities.draw + "%";
    awayLabel.textContent = probabilities.away + "%";

    const confBadge = document.getElementById("confidenceBadge");
    const confColors = {
      High: "bg-green-100 text-green-800 border-green-300",
      Medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
      Low: "bg-red-100 text-red-800 border-red-300"
    };
    confBadge.className = `inline-block px-3 py-1 rounded-full text-sm font-semibold border ${confColors[confidence]}`;
    confBadge.textContent = confidence;

    const factorsList = document.getElementById("factorsList");
    factorsList.innerHTML = "";
    factors.forEach((f) => {
      const li = document.createElement("li");
      li.className = "flex items-start gap-2 text-gray-700";
      li.innerHTML = `<span class="text-blue-500 mt-0.5">&#9679;</span> ${f}`;
      factorsList.appendChild(li);
    });

    this.renderChart(probabilities);
  },

  renderChart(probs) {
    if (probChartInstance) {
      probChartInstance.destroy();
    }
    const ctx = document.getElementById("probChart").getContext("2d");
    probChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Home Win", "Draw", "Away Win"],
        datasets: [{
          data: [probs.home, probs.draw, probs.away],
          backgroundColor: ["#22c55e", "#facc15", "#ef4444"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 12, usePointStyle: true, font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ": " + ctx.parsed + "%";
              }
            }
          }
        },
        cutout: "65%"
      }
    });
  },

  resetResults() {
    const section = document.getElementById("resultsSection");
    section.classList.add("hidden");
    section.classList.remove("block");
    if (probChartInstance) {
      probChartInstance.destroy();
      probChartInstance = null;
    }
  }
};
