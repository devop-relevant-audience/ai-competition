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
      return { empire: e, territoryCount: territories.length, totalUnits, armyCount: armies.length };
    }).sort((a, b) => b.territoryCount - a.territoryCount);

    const maxTerritories = stats[0]?.territoryCount || 0;

    this.container.innerHTML = stats.map((s, i) => {
      const e = s.empire;
      const leading = i === 0 && !e.isEliminated ? 'leading' : '';
      const eliminated = e.isEliminated ? 'eliminated' : '';

      let relations = '';
      const others = empires.filter(o => o.id !== e.id);
      const relBadges = others.map(o => {
        const rel = getRelation(gameState, e.id, o.id);
        const status = rel ? rel.status : 'neutral';
        const dotColor = o.color;
        return `<span class="relation-badge ${status}" title="${o.name}: ${status}"><span style="color:${dotColor}">●</span> ${status}</span>`;
      }).join('');

      return `
        <div class="empire-stat-row ${leading} ${eliminated}">
          <div class="empire-stat-color" style="background:${e.color}"></div>
          <div class="empire-stat-name" style="color:${e.color}">
            ${e.name}
            ${e.isEliminated ? '<span style="color:var(--danger);font-size:0.7rem"> ELIMINATED</span>' : ''}
            <div class="relations-row">${relBadges}</div>
          </div>
          <div class="empire-stat-metrics">
            <span title="Territories">🏰 ${s.territoryCount}</span>
            <span title="Army units">⚔️ ${s.totalUnits}</span>
            <span title="Treasury">💰 ${e.treasury}</span>
            <span title="Reputation">⭐ ${e.reputation}</span>
          </div>
        </div>`;
    }).join('');
  }
}
