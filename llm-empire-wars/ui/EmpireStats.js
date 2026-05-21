import { getEmpireTerritories, getEmpireArmies, getRelation } from '../engine/GameState.js';

export class EmpireStats {
  constructor(container) {
    this.container = container;
  }

  update(gameState) {
    const empires = Object.values(gameState.empires);
    const stats = empires.map(e => {
      const territories = getEmpireTerritories(gameState, e.id);
      const armies = getEmpireArmies(gameState, e.id);
      const totalUnits = armies.reduce((s, a) => s + a.size, 0);
      const totalFood = territories.reduce((s, t) => s + t.resources.food + (t.buildings?.farm ? 2 : 0), 0);
      return { empire: e, territoryCount: territories.length, totalUnits, armyCount: armies.length, totalFood };
    }).sort((a, b) => b.territoryCount - a.territoryCount);

    this.container.innerHTML = stats.map((s, i) => {
      const e = s.empire;
      const leading = i === 0 && !e.isEliminated ? 'leading' : '';
      const eliminated = e.isEliminated ? 'eliminated' : '';

      const others = empires.filter(o => o.id !== e.id && !o.isEliminated);
      const relBadges = others.map(o => {
        const rel = getRelation(gameState, e.id, o.id);
        const status = rel ? rel.status : 'neutral';
        return `<span class="relation-badge ${status}"><span style="color:${o.color}">●</span> ${status}</span>`;
      }).join('');

      return `
        <div class="empire-stat-row ${leading} ${eliminated}">
          <div class="empire-stat-color" style="background:${e.color}"></div>
          <div class="empire-stat-name" style="color:${e.color}">
            ${this._escapeHtml(e.name)}
            ${e.isEliminated ? '<span style="color:var(--danger);font-size:10px;font-weight:500;margin-left:6px">ELIMINATED</span>' : ''}
            <div class="relations-row">${relBadges}</div>
          </div>
          <div class="empire-stat-metrics">
            <span class="metric" title="Territories"><span class="metric-value">${s.territoryCount}</span> terr</span>
            <span class="metric" title="Army units"><span class="metric-value">${s.totalUnits}</span> units</span>
            <span class="metric" title="Food"><span class="metric-value">${s.totalFood}</span> food</span>
            <span class="metric" title="Treasury"><span class="metric-value">${e.treasury}</span> gold</span>
            <span class="metric" title="Reputation"><span class="metric-value">${e.reputation}</span> rep</span>
            <span class="metric" title="Confidence">${this._confidenceBar(e.confidence)}</span>
          </div>
        </div>`;
    }).join('');
  }

  _confidenceBar(confidence) {
    const pct = Math.max(0, Math.min(100, confidence));
    let color = 'var(--danger)';
    if (pct > 30) color = 'var(--warning)';
    if (pct > 60) color = 'var(--success)';
    return `<span class="metric-value">${pct}</span> conf`;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
