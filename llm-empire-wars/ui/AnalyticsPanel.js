const CHART_DEFS = [
  { key: 'territories', label: 'Territories', metric: 'territories', yLabel: 'Territories', fill: true },
  { key: 'military',    label: 'Military',    metric: 'units',       yLabel: 'Total Units',  fill: false },
  { key: 'treasury',    label: 'Treasury',    metric: 'treasury',    yLabel: 'Capital',      fill: false },
  { key: 'income',      label: 'Income',      metric: 'goldIncome',  yLabel: 'Gold / Turn',  fill: false },
  { key: 'production',  label: 'Production',  metric: 'prodIncome',  yLabel: 'Prod / Turn',  fill: false },
  { key: 'food',        label: 'Food',        metric: 'foodIncome',  yLabel: 'Food / Turn',  fill: false },
  { key: 'reputation',  label: 'Reputation',  metric: 'reputation',  yLabel: 'Reputation',   fill: false },
  { key: 'score',       label: 'Score',        metric: null,          yLabel: 'Score',         fill: false },
];

function chartOpts(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#8a8f98',
          font: { family: "'Inter', sans-serif", size: 11 },
          boxWidth: 10, boxHeight: 10, padding: 14,
          usePointStyle: true, pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: '#191a1d',
        titleColor: '#f7f8f8',
        bodyColor: '#d0d6e0',
        borderColor: '#34363b',
        borderWidth: 1,
        titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(35,37,42,0.6)', drawBorder: false },
        ticks: { color: '#62666d', font: { family: "'JetBrains Mono', monospace", size: 10 } },
        title: { display: true, text: 'Turn', color: '#62666d', font: { family: "'Inter', sans-serif", size: 11 } },
      },
      y: {
        grid: { color: 'rgba(35,37,42,0.6)', drawBorder: false },
        ticks: { color: '#62666d', font: { family: "'JetBrains Mono', monospace", size: 10 } },
        beginAtZero: true,
        title: { display: true, text: yLabel, color: '#62666d', font: { family: "'Inter', sans-serif", size: 11 } },
      },
    },
  };
}

function makeDatasets(tracker, empires, metric, fill, isScore) {
  const empireIds = tracker.getEmpireIds();
  return empireIds.map(eid => {
    const empire = empires[eid];
    if (!empire) return null;
    const data = isScore
      ? tracker.getComputedScore(eid)
      : tracker.getSeries(eid, metric);
    const turns = tracker.getTurns();
    return {
      label: empire.name,
      data,
      borderColor: empire.color,
      backgroundColor: empire.color + '18',
      pointBackgroundColor: empire.color,
      pointBorderColor: empire.color,
      pointRadius: turns.length > 30 ? 0 : 2,
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0.3,
      fill,
    };
  }).filter(Boolean);
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}


export class AnalyticsPanel {
  constructor(modalEl) {
    this.modal = modalEl;
    this.body = modalEl.querySelector('#analytics-modal-body');
    this.chart = null;
    this.tracker = null;
    this.empires = {};
    this.gameState = null;
    this.activeChart = 'territories';
    this.isOpen = false;

    modalEl.querySelector('#analytics-close-btn').addEventListener('click', () => this.close());
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  setTracker(tracker) { this.tracker = tracker; }

  update(gameState) {
    if (!gameState) return;
    this.gameState = gameState;
    this.empires = gameState.empires;
    if (this.isOpen) this._refresh();
  }

  open() {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this._renderBody();
    requestAnimationFrame(() => this._createChart());
  }

  close() {
    this.isOpen = false;
    this.modal.classList.add('hidden');
    if (this.chart) { this.chart.destroy(); this.chart = null; }
  }

  _renderBody() {
    const tabsHtml = CHART_DEFS.map(d =>
      `<button class="anl-subtab${d.key === this.activeChart ? ' active' : ''}" data-chart="${d.key}">${d.label}</button>`
    ).join('');

    const summaryHtml = this._buildSummary();

    this.body.innerHTML = `
      <div class="anl-subtabs">${tabsHtml}</div>
      <div class="anl-chart-area"><canvas id="anl-canvas"></canvas></div>
      <div class="anl-summary">${summaryHtml}</div>
    `;

    this.body.querySelectorAll('.anl-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeChart = btn.dataset.chart;
        this.body.querySelectorAll('.anl-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._createChart();
      });
    });
  }

  _createChart() {
    if (!this.tracker || this.tracker.history.length === 0) return;
    const canvas = this.body.querySelector('#anl-canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chart) this.chart.destroy();

    const def = CHART_DEFS.find(d => d.key === this.activeChart);
    if (!def) return;

    const turns = this.tracker.getTurns();
    const datasets = makeDatasets(this.tracker, this.empires, def.metric, def.fill, !def.metric);

    this.chart = new Chart(canvas, {
      type: 'line',
      data: { labels: turns.map(t => `T${t}`), datasets },
      options: chartOpts(def.yLabel),
    });
  }

  _refresh() {
    const summaryEl = this.body.querySelector('.anl-summary');
    if (summaryEl) summaryEl.innerHTML = this._buildSummary();
    this._createChart();
  }

  _buildSummary() {
    if (!this.tracker || !this.gameState) return '';
    const empireIds = this.tracker.getEmpireIds();
    return empireIds.map(eid => {
      const empire = this.gameState.empires[eid];
      if (!empire) return '';
      const latest = this.tracker.getLatest(eid);
      if (!latest) return '';
      const battle = this.tracker.getBattleStats(eid);
      const peakTerr = this.tracker.getPeakTerritory(eid);
      const peakArmy = this.tracker.getPeakArmy(eid);
      const elim = empire.isEliminated;
      return `
        <div class="anl-empire${elim ? ' anl-elim' : ''}">
          <div class="anl-empire-hdr">
            <span class="anl-dot" style="background:${empire.color}"></span>
            <span class="anl-name" style="color:${empire.color}">${esc(empire.name)}</span>
            ${elim ? '<span class="anl-elim-badge">ELIMINATED</span>' : ''}
          </div>
          <div class="anl-grid">
            <div class="anl-cell"><span class="anl-val">${latest.territories}</span><span class="anl-lbl">Terr</span><span class="anl-sub">peak ${peakTerr}</span></div>
            <div class="anl-cell"><span class="anl-val">${latest.units}</span><span class="anl-lbl">Units</span><span class="anl-sub">peak ${peakArmy}</span></div>
            <div class="anl-cell"><span class="anl-val">${latest.treasury}</span><span class="anl-lbl">Capital</span></div>
            <div class="anl-cell"><span class="anl-val">${latest.goldIncome}/t</span><span class="anl-lbl">Income</span></div>
            <div class="anl-cell"><span class="anl-val">${battle.won}W/${battle.lost}L</span><span class="anl-lbl">Battles</span><span class="anl-sub">${battle.fought} total</span></div>
            <div class="anl-cell"><span class="anl-val">${latest.reputation}</span><span class="anl-lbl">Rep</span></div>
          </div>
        </div>`;
    }).join('');
  }
}


export class GameOverAnalytics {
  constructor() {
    this.charts = {};
  }

  render(container, tracker, gameState) {
    if (!tracker || !gameState) return;

    const empireIds = tracker.getEmpireIds();
    const turns = tracker.getTurns();

    const empiresSorted = empireIds
      .map(eid => {
        const empire = gameState.empires[eid];
        const latest = tracker.getLatest(eid);
        const score = tracker.getComputedScore(eid);
        return { empire, latest, finalScore: score[score.length - 1] || 0 };
      })
      .filter(e => e.empire)
      .sort((a, b) => b.finalScore - a.finalScore);

    const winner = empiresSorted[0];

    container.innerHTML = `
      <div class="go-analytics">
        <div class="go-header">
          <h1 class="go-title"><span style="color:${winner?.empire.color}">${esc(winner?.empire.name || '')}</span> Wins!</h1>
          <p class="go-subtitle">Game ended after ${turns.length} turns</p>
        </div>
        <div class="go-standings">
          ${empiresSorted.map((e, i) => this._renderStanding(e, i, tracker)).join('')}
        </div>
        <div class="go-charts-grid">
          <div class="go-chart-card"><h3>Territory Control</h3><div class="go-chart-wrap"><canvas id="go-chart-territory"></canvas></div></div>
          <div class="go-chart-card"><h3>Military Strength</h3><div class="go-chart-wrap"><canvas id="go-chart-military"></canvas></div></div>
          <div class="go-chart-card"><h3>Treasury</h3><div class="go-chart-wrap"><canvas id="go-chart-treasury"></canvas></div></div>
          <div class="go-chart-card"><h3>Empire Score</h3><div class="go-chart-wrap"><canvas id="go-chart-score"></canvas></div></div>
        </div>
        <div class="go-actions">
          <button id="go-restart-btn" class="btn-primary">New Game</button>
          <button id="go-review-btn" class="btn-secondary">Review Map</button>
        </div>
      </div>
    `;

    this._createChart(container, 'go-chart-territory', tracker, gameState, 'territories', turns, true);
    this._createChart(container, 'go-chart-military', tracker, gameState, 'units', turns, false);
    this._createChart(container, 'go-chart-treasury', tracker, gameState, 'treasury', turns, false);
    this._createScoreChart(container, 'go-chart-score', tracker, gameState, turns);
  }

  _renderStanding(entry, rank, tracker) {
    const { empire, latest } = entry;
    const battle = tracker.getBattleStats(empire.id);
    const peakTerr = tracker.getPeakTerritory(empire.id);
    const peakArmy = tracker.getPeakArmy(empire.id);
    const medal = rank === 0 ? 'go-gold' : rank === 1 ? 'go-silver' : rank === 2 ? 'go-bronze' : '';
    const elim = empire.isEliminated;

    return `
      <div class="go-standing ${medal}${elim ? ' go-eliminated' : ''}">
        <div class="go-rank">#${rank + 1}</div>
        <div class="go-standing-color" style="background:${empire.color}"></div>
        <div class="go-standing-info">
          <div class="go-standing-name" style="color:${empire.color}">${esc(empire.name)}</div>
          ${elim ? '<span class="anl-elim-badge">ELIMINATED</span>' : ''}
        </div>
        <div class="go-standing-stats">
          <span class="go-stat"><b>${latest?.territories ?? 0}</b> terr <span class="go-stat-sub">(peak ${peakTerr})</span></span>
          <span class="go-stat"><b>${latest?.units ?? 0}</b> units <span class="go-stat-sub">(peak ${peakArmy})</span></span>
          <span class="go-stat"><b>${latest?.treasury ?? 0}</b> cap</span>
          <span class="go-stat"><b>${battle.won}W</b>/${battle.lost}L</span>
        </div>
      </div>`;
  }

  _createChart(container, canvasId, tracker, gameState, metric, turns, fill) {
    const canvas = container.querySelector(`#${canvasId}`);
    if (!canvas || typeof Chart === 'undefined') return;
    const datasets = makeDatasets(tracker, gameState.empires, metric, fill, false);
    this.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: { labels: turns.map(t => `T${t}`), datasets },
      options: chartOpts(metric),
    });
  }

  _createScoreChart(container, canvasId, tracker, gameState, turns) {
    const canvas = container.querySelector(`#${canvasId}`);
    if (!canvas || typeof Chart === 'undefined') return;
    const datasets = makeDatasets(tracker, gameState.empires, null, false, true);
    this.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: { labels: turns.map(t => `T${t}`), datasets },
      options: chartOpts('Score'),
    });
  }

  destroy() {
    Object.values(this.charts).forEach(c => c.destroy());
    this.charts = {};
  }
}
