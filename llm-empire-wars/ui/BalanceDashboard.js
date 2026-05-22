function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function pct(v) { return (v * 100).toFixed(1) + '%'; }
function fixed(v, d = 1) { return Number(v).toFixed(d); }

const ACTION_LABELS = {
  move_army: 'Move',
  recruit_units: 'Recruit',
  build: 'Build',
  declare_war: 'War',
  propose_alliance: 'Alliance',
  propose_trade: 'Trade',
  propose_peace: 'Peace',
  break_alliance: 'Break',
  send_message: 'Message',
  impose_embargo: 'Embargo',
  lift_embargo: 'Lift Emb.',
  research: 'Research',
};

export class BalanceDashboard {
  constructor(modalEl, metaStore) {
    this.modal = modalEl;
    this.body = modalEl.querySelector('#balance-modal-body');
    this.metaStore = metaStore;
    this.charts = {};
    this.isOpen = false;
    this.activeTab = 'overview';
    this.filterPreset = null;

    modalEl.querySelector('#balance-close-btn').addEventListener('click', () => this.close());
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  async open() {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    await this._refresh();
  }

  close() {
    this.isOpen = false;
    this.modal.classList.add('hidden');
    this._destroyCharts();
  }

  async _refresh() {
    const agg = await this.metaStore.computeAggregates(this.filterPreset);
    this._render(agg);
  }

  _render(agg) {
    if (agg.gameCount === 0) {
      this.body.innerHTML = `
        <div class="bd-empty">
          <h3>No game data yet</h3>
          <p>Play some games to completion — reports are saved automatically when a game ends.</p>
          <p>Data accumulates across sessions in this browser.</p>
        </div>`;
      return;
    }

    const presetFilter = agg.presets.length > 1
      ? `<div class="bd-filter">
          <label>Filter by map:</label>
          <select id="bd-preset-filter">
            <option value="">All maps (${agg.gameCount} games)</option>
            ${agg.presets.map(p => `<option value="${p}" ${p === this.filterPreset ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>`
      : '';

    const tabs = [
      { key: 'overview', label: 'Overview' },
      { key: 'actions', label: 'Actions' },
      { key: 'combat', label: 'Combat' },
      { key: 'games', label: 'Game List' },
    ];
    const tabsHtml = tabs.map(t =>
      `<button class="bd-tab${t.key === this.activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
    ).join('');

    this.body.innerHTML = `
      <div class="bd-header-row">
        <div class="bd-game-count">${agg.gameCount} game${agg.gameCount !== 1 ? 's' : ''} recorded</div>
        ${presetFilter}
        <div class="bd-export-btns">
          <button class="btn-secondary btn-sm" id="bd-export-json">Export JSON</button>
          <button class="btn-secondary btn-sm" id="bd-export-csv">Export CSV</button>
          <button class="btn-secondary btn-sm bd-danger" id="bd-clear-all">Clear All Data</button>
        </div>
      </div>
      <div class="bd-tabs">${tabsHtml}</div>
      <div class="bd-content" id="bd-content"></div>
    `;

    this.body.querySelectorAll('.bd-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.body.querySelectorAll('.bd-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderTab(agg);
      });
    });

    const presetSelect = this.body.querySelector('#bd-preset-filter');
    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        this.filterPreset = presetSelect.value || null;
        this._refresh();
      });
    }

    this.body.querySelector('#bd-export-json')?.addEventListener('click', () => this.metaStore.exportJSON());
    this.body.querySelector('#bd-export-csv')?.addEventListener('click', () => this.metaStore.exportCSV());
    this.body.querySelector('#bd-clear-all')?.addEventListener('click', async () => {
      if (confirm('Delete ALL stored game analytics data? This cannot be undone.')) {
        await this.metaStore.clearAll();
        await this._refresh();
      }
    });

    this._renderTab(agg);
  }

  _renderTab(agg) {
    const container = this.body.querySelector('#bd-content');
    if (!container) return;
    this._destroyCharts();

    switch (this.activeTab) {
      case 'overview': this._renderOverview(container, agg); break;
      case 'actions': this._renderActions(container, agg); break;
      case 'combat': this._renderCombat(container, agg); break;
      case 'games': this._renderGameList(container, agg); break;
    }
  }

  _renderOverview(container, agg) {
    const empires = Object.values(agg.empires).sort((a, b) => b.winRate - a.winRate);

    container.innerHTML = `
      <div class="bd-section">
        <h3>Win Rate & Rankings</h3>
        <div class="bd-chart-row">
          <div class="bd-chart-wrap"><canvas id="bd-winrate-chart"></canvas></div>
          <div class="bd-chart-wrap"><canvas id="bd-avgrank-chart"></canvas></div>
        </div>
      </div>
      <div class="bd-section">
        <h3>Empire Performance Summary</h3>
        <div class="bd-table-wrap">
          <table class="bd-table">
            <thead>
              <tr>
                <th>Empire</th><th>Games</th><th>Win Rate</th><th>Avg Rank</th>
                <th>Avg Terr</th><th>Peak Terr</th><th>Avg Units</th>
                <th>Elim Rate</th><th>Avg Elim Turn</th>
              </tr>
            </thead>
            <tbody>
              ${empires.map(e => `
                <tr>
                  <td class="bd-empire-name">${esc(e.empireName)}</td>
                  <td>${e.gamesPlayed}</td>
                  <td class="bd-highlight">${pct(e.winRate)}</td>
                  <td>${fixed(e.avgRank)}</td>
                  <td>${fixed(e.avgFinalTerritories)}</td>
                  <td>${fixed(e.avgPeakTerritories)}</td>
                  <td>${fixed(e.avgFinalUnits)}</td>
                  <td>${pct(e.eliminationRate)}</td>
                  <td>${e.avgEliminationTurn != null ? fixed(e.avgEliminationTurn, 0) : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="bd-section">
        <h3>Territory & Military Averages</h3>
        <div class="bd-chart-row">
          <div class="bd-chart-wrap"><canvas id="bd-territory-chart"></canvas></div>
          <div class="bd-chart-wrap"><canvas id="bd-units-chart"></canvas></div>
        </div>
      </div>
    `;

    this._createBarChart('bd-winrate-chart', empires, 'Win Rate', e => e.winRate * 100, '%');
    this._createBarChart('bd-avgrank-chart', empires, 'Avg Rank (lower = better)', e => e.avgRank, '', true);
    this._createBarChart('bd-territory-chart', empires, 'Avg Final Territories', e => e.avgFinalTerritories);
    this._createBarChart('bd-units-chart', empires, 'Avg Peak Units', e => e.avgPeakUnits);
  }

  _renderActions(container, agg) {
    const empires = Object.values(agg.empires);
    const allActionTypes = [...new Set(empires.flatMap(e => Object.keys(e.actionTotals)))];

    container.innerHTML = `
      <div class="bd-section">
        <h3>Action Distribution per Empire</h3>
        <div class="bd-chart-wrap bd-chart-wide"><canvas id="bd-action-chart"></canvas></div>
      </div>
      <div class="bd-section">
        <h3>Action Breakdown</h3>
        <div class="bd-table-wrap">
          <table class="bd-table">
            <thead>
              <tr>
                <th>Empire</th>
                ${allActionTypes.map(a => `<th>${ACTION_LABELS[a] || a}</th>`).join('')}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${empires.map(e => {
                const total = Object.values(e.actionTotals).reduce((s, v) => s + v, 0);
                return `<tr>
                  <td class="bd-empire-name">${esc(e.empireName)}</td>
                  ${allActionTypes.map(a => `<td>${e.actionTotals[a] || 0}</td>`).join('')}
                  <td class="bd-highlight">${total}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="bd-section">
        <h3>Global Action Distribution</h3>
        <div class="bd-chart-wrap"><canvas id="bd-global-action-chart"></canvas></div>
      </div>
    `;

    this._createStackedActionChart('bd-action-chart', empires, allActionTypes);
    this._createDoughnutChart('bd-global-action-chart', agg.actionTotals);
  }

  _renderCombat(container, agg) {
    const empires = Object.values(agg.empires).sort((a, b) => b.battleWinRate - a.battleWinRate);

    container.innerHTML = `
      <div class="bd-section">
        <h3>Battle Performance</h3>
        <div class="bd-chart-row">
          <div class="bd-chart-wrap"><canvas id="bd-battle-winrate-chart"></canvas></div>
          <div class="bd-chart-wrap"><canvas id="bd-battles-total-chart"></canvas></div>
        </div>
      </div>
      <div class="bd-section">
        <h3>Combat Stats</h3>
        <div class="bd-table-wrap">
          <table class="bd-table">
            <thead>
              <tr>
                <th>Empire</th><th>Battles</th><th>Won</th><th>Lost</th>
                <th>Win Rate</th><th>Personality</th>
              </tr>
            </thead>
            <tbody>
              ${empires.map(e => `
                <tr>
                  <td class="bd-empire-name">${esc(e.empireName)}</td>
                  <td>${e.battlesFought}</td>
                  <td>${e.battlesWon}</td>
                  <td>${e.battlesLost}</td>
                  <td class="bd-highlight">${pct(e.battleWinRate)}</td>
                  <td class="bd-personality">${e.personality}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this._createBarChart('bd-battle-winrate-chart', empires, 'Battle Win Rate', e => e.battleWinRate * 100, '%');
    this._createBarChart('bd-battles-total-chart', empires, 'Total Battles Fought', e => e.battlesFought);
  }

  async _renderGameList(container, agg) {
    const reports = await this.metaStore.getAllReports();
    const sorted = reports.sort((a, b) => new Date(b.reportCreatedAt) - new Date(a.reportCreatedAt));

    container.innerHTML = `
      <div class="bd-section">
        <h3>All Recorded Games</h3>
        <div class="bd-table-wrap">
          <table class="bd-table">
            <thead>
              <tr>
                <th>Date</th><th>Map</th><th>Turns</th><th>Winner</th>
                <th>Win Condition</th><th>Empires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(r => `
                <tr>
                  <td>${new Date(r.reportCreatedAt).toLocaleDateString()}</td>
                  <td>${r.presetKey}</td>
                  <td>${r.turnCount}</td>
                  <td class="bd-empire-name">${esc(r.winner?.empireName || '?')}</td>
                  <td>${r.winner?.reason || '?'}</td>
                  <td>${(r.empireResults || []).length}</td>
                  <td><button class="btn-secondary btn-xs bd-delete-game" data-game-id="${r.gameId}">Delete</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.bd-delete-game').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.metaStore.deleteReport(btn.dataset.gameId);
        await this._refresh();
      });
    });
  }

  // ── Chart Helpers ──

  _createBarChart(canvasId, empires, label, valueFn, suffix = '', invertColor = false) {
    const canvas = this.body.querySelector(`#${canvasId}`);
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = empires.map(e => e.empireName.replace(/^The /, ''));
    const data = empires.map(valueFn);
    const colors = empires.map(() => invertColor ? '#e85d04' : '#239480');

    this.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label, data, backgroundColor: colors.map(c => c + '88'), borderColor: colors, borderWidth: 1 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#191a1d',
            bodyColor: '#d0d6e0',
            borderColor: '#34363b',
            borderWidth: 1,
            callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(1)}${suffix}` },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(35,37,42,0.6)' },
            ticks: { color: '#8a8f98', font: { size: 10 }, maxRotation: 45 },
          },
          y: {
            grid: { color: 'rgba(35,37,42,0.6)' },
            ticks: { color: '#62666d', font: { size: 10 } },
            beginAtZero: true,
          },
        },
      },
    });
  }

  _createStackedActionChart(canvasId, empires, actionTypes) {
    const canvas = this.body.querySelector(`#${canvasId}`);
    if (!canvas || typeof Chart === 'undefined') return;

    const palette = [
      '#239480', '#e85d04', '#6b3fa0', '#2d6b8b', '#c9652a',
      '#b83a2d', '#4a7c4e', '#ad8a2b', '#c27a23', '#7d4394',
      '#4a6741', '#3a7ca5',
    ];
    const labels = empires.map(e => e.empireName.replace(/^The /, ''));
    const datasets = actionTypes.map((aType, i) => ({
      label: ACTION_LABELS[aType] || aType,
      data: empires.map(e => e.actionTotals[aType] || 0),
      backgroundColor: palette[i % palette.length] + 'aa',
      borderColor: palette[i % palette.length],
      borderWidth: 1,
    }));

    this.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#8a8f98', font: { size: 10 }, boxWidth: 10, padding: 8, usePointStyle: true },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(35,37,42,0.6)' },
            ticks: { color: '#8a8f98', font: { size: 10 }, maxRotation: 45 },
          },
          y: {
            stacked: true,
            grid: { color: 'rgba(35,37,42,0.6)' },
            ticks: { color: '#62666d', font: { size: 10 } },
            beginAtZero: true,
          },
        },
      },
    });
  }

  _createDoughnutChart(canvasId, actionTotals) {
    const canvas = this.body.querySelector(`#${canvasId}`);
    if (!canvas || typeof Chart === 'undefined') return;

    const entries = Object.entries(actionTotals).sort((a, b) => b[1] - a[1]);
    const palette = [
      '#239480', '#e85d04', '#6b3fa0', '#2d6b8b', '#c9652a',
      '#b83a2d', '#4a7c4e', '#ad8a2b', '#c27a23', '#7d4394',
      '#4a6741', '#3a7ca5',
    ];

    this.charts[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => ACTION_LABELS[k] || k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map((_, i) => palette[i % palette.length] + 'cc'),
          borderColor: '#111113',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#8a8f98', font: { size: 10 }, boxWidth: 10, padding: 6, usePointStyle: true },
          },
        },
      },
    });
  }

  _destroyCharts() {
    for (const c of Object.values(this.charts)) c.destroy();
    this.charts = {};
  }
}
