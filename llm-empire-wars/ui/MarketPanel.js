import { RESOURCE_DEFS, RESOURCE_IDS } from '../data/resources.js';
import { TERRITORY_DATA } from '../data/territories.js';

const RESOURCE_COLORS = {
  oil: '#4a9eff',
  uranium: '#a855f7',
  rare_earths: '#22c55e',
  titanium: '#f59e0b',
};

export class MarketPanel {
  constructor(modalEl) {
    this.modal = modalEl;
    this.body = modalEl.querySelector('#market-modal-body');
    this.closeBtn = modalEl.querySelector('#market-close-btn');
    this.charts = {};

    this.closeBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open() {
    this.modal.classList.remove('hidden');
    this._render();
  }

  close() {
    this.modal.classList.add('hidden');
    this._destroyCharts();
  }

  update(gameState) {
    this.gameState = gameState;
    if (!this.modal.classList.contains('hidden')) {
      this._render();
    }
  }

  _render() {
    if (!this.gameState?.market) {
      this.body.innerHTML = '<p style="color:var(--ink-subtle)">No market data available.</p>';
      return;
    }

    const market = this.gameState.market;
    this._destroyCharts();

    let html = '<div class="market-grid">';

    for (const rid of RESOURCE_IDS) {
      const pd = market.prices[rid];
      const def = RESOURCE_DEFS[rid];
      const current = pd.current;
      const hist = pd.history;
      const prev = hist.length >= 2 ? hist[hist.length - 2].price : current;
      const change = prev > 0 ? ((current - prev) / prev) * 100 : 0;
      const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
      const changeStr = change === 0 ? '0%' : (change > 0 ? `+${change.toFixed(0)}%` : `${change.toFixed(0)}%`);
      const lastVolume = hist.length > 0 ? hist[hist.length - 1].volume : 0;
      const hasBubble = market.bubbles[rid] >= 3;

      const supplyInfo = this._getSupplyInfo(rid);

      html += `
        <div class="market-card">
          <div class="market-card-header">
            <span class="market-card-name">${def.label}${hasBubble ? ' <span class="market-bubble-badge">BUBBLE</span>' : ''}</span>
            <div>
              <span class="market-card-price" style="color:${RESOURCE_COLORS[rid]}">${current.toFixed(1)}c</span>
              <span class="market-card-change ${changeClass}">${changeStr}</span>
            </div>
          </div>
          <div class="market-card-chart">
            <canvas id="market-chart-${rid}"></canvas>
          </div>
          <div class="market-card-info">
            <span>Vol: ${lastVolume} units traded this turn</span>
            <span>Supply: ${supplyInfo}</span>
          </div>
        </div>`;
    }
    html += '</div>';

    if (market.bans.length > 0) {
      html += '<div class="market-section-title">Active Market Bans</div>';
      html += '<div class="market-bans-list">';
      for (const ban of market.bans) {
        const imposer = this.gameState.empires[ban.imposedByEmpireId]?.name || ban.imposedByEmpireId;
        const target = this.gameState.empires[ban.targetEmpireId]?.name || ban.targetEmpireId;
        html += `<div class="ban-item">${imposer} banned ${target} (expires turn ${ban.expiresOnTurn})</div>`;
      }
      html += '</div>';
    }

    if (market.turnActivity && market.turnActivity.length > 0) {
      html += '<div class="market-section-title">Recent Market Activity</div>';
      html += '<div class="market-activity-list">';
      for (const act of market.turnActivity.slice(-10)) {
        const name = this.gameState.empires[act.empireId]?.name || act.empireId;
        let desc = '';
        switch (act.type) {
          case 'buy': desc = `${name} bought ${act.amount} ${act.resource} at ${act.price}c`; break;
          case 'sell': desc = `${name} sold ${act.amount} ${act.resource} at ${act.price}c`; break;
          case 'dump': desc = `${name} DUMPED ${act.amount} ${act.resource} at ${act.price}c`; break;
          case 'corner': desc = `${name} CORNERED ${act.amount} ${act.resource} at ${act.price}c`; break;
          case 'ban': {
            const tgt = this.gameState.empires[act.targetId]?.name || act.targetId;
            desc = `${name} banned ${tgt} from the exchange`;
            break;
          }
          default: desc = `${name}: ${act.type}`;
        }
        html += `<div class="market-activity-item">${desc}</div>`;
      }
      html += '</div>';
    }

    this.body.innerHTML = html;

    requestAnimationFrame(() => this._createCharts(market));
  }

  _createCharts(market) {
    for (const rid of RESOURCE_IDS) {
      const canvas = document.getElementById(`market-chart-${rid}`);
      if (!canvas) continue;

      const hist = market.prices[rid].history;
      const labels = hist.map(h => `T${h.turn}`);
      const data = hist.map(h => h.price);

      const ctx = canvas.getContext('2d');
      const color = RESOURCE_COLORS[rid];

      this.charts[rid] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data,
            borderColor: color,
            backgroundColor: color + '20',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              display: true,
              grid: { color: 'rgba(138,143,152,0.1)' },
              ticks: { color: '#8a8f98', font: { size: 9 }, maxTicksLimit: 8 },
            },
            y: {
              display: true,
              grid: { color: 'rgba(138,143,152,0.1)' },
              ticks: { color: '#8a8f98', font: { size: 9 } },
              min: 0,
              suggestedMax: 12,
            },
          },
          interaction: { mode: 'index', intersect: false },
        },
      });
    }
  }

  _destroyCharts() {
    for (const chart of Object.values(this.charts)) {
      chart.destroy();
    }
    this.charts = {};
  }

  _getSupplyInfo(resource) {
    if (!this.gameState) return '';
    const producers = [];
    for (const [tid, terr] of Object.entries(this.gameState.territories)) {
      if (TERRITORY_DATA[tid]?.rareResource === resource) {
        const ownerName = terr.ownerId
          ? (this.gameState.empires[terr.ownerId]?.name || terr.ownerId)
          : 'Neutral';
        producers.push(ownerName);
      }
    }
    if (producers.length === 0) return 'No known deposits';
    const counts = {};
    producers.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    const parts = Object.entries(counts).map(([n, c]) => `${n} ${c}`).join(', ');
    return `${producers.length} territories — ${parts}`;
  }
}
