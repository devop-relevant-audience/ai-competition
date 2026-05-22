import { getEmpireTerritories, getEmpireArmies, getTotalTerritories, getRelation } from '../engine/GameState.js';

export class EmpireStats {
  constructor(container) {
    this.container = container;
  }

  update(gameState) {
    const empires = Object.values(gameState.empires);
    const totalTerr = getTotalTerritories(gameState);

    const stats = empires.map(e => {
      const territories = getEmpireTerritories(gameState, e.id);
      const armies = getEmpireArmies(gameState, e.id);
      const totalUnits = armies.reduce((s, a) => s + a.size, 0);
      const capitalIncome = territories.reduce((s, t) => s + (t.resources.capital || 0) + (t.buildings?.trade_office ? 2 : 0), 0);
      const terrPct = totalTerr > 0 ? (territories.length / totalTerr) * 100 : 0;
      return { empire: e, terrCount: territories.length, terrPct, totalUnits, capitalIncome };
    }).sort((a, b) => b.terrCount - a.terrCount);

    this.container.innerHTML = stats.map((s, rank) => {
      const e = s.empire;
      const isLeader = rank === 0 && !e.isEliminated;
      const elim = e.isEliminated;

      const rels = empires
        .filter(o => o.id !== e.id && !o.isEliminated)
        .map(o => {
          const rel = getRelation(gameState, e.id, o.id);
          const st = rel ? rel.status : 'neutral';
          if (st === 'neutral') return '';
          return `<span class="es-rel es-rel-${st}" title="${this._esc(o.name)}: ${st}"><span class="es-rel-dot" style="color:${o.color}">&#9679;</span>${st}</span>`;
        })
        .filter(Boolean)
        .join('');

      return `
      <div class="es-card${isLeader ? ' es-leader' : ''}${elim ? ' es-elim' : ''}">
        <div class="es-top">
          <span class="es-rank">#${rank + 1}</span>
          <span class="es-dot" style="background:${e.color}"></span>
          <span class="es-name" style="color:${e.color}">${this._esc(e.name)}</span>
          ${elim ? '<span class="es-elim-tag">ELIM</span>' : ''}
        </div>
        <div class="es-bar-row">
          <div class="es-bar"><div class="es-bar-fill" style="width:${s.terrPct}%;background:${e.color}"></div></div>
          <span class="es-bar-num">${s.terrCount}<span class="es-bar-sep">/</span>${totalTerr}</span>
        </div>
        <div class="es-nums">
          <span class="es-n" title="Army units">${s.totalUnits} <i>units</i></span>
          <span class="es-n" title="Treasury">${e.treasury} <i>cap</i></span>
          <span class="es-n" title="Capital income">${s.capitalIncome} <i>inc</i></span>
          <span class="es-n" title="Confidence">${e.confidence} <i>conf</i></span>
        </div>
        ${rels ? `<div class="es-rels">${rels}</div>` : ''}
      </div>`;
    }).join('');
  }

  _esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
