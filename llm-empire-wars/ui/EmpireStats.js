import { getEmpireTerritories, getEmpireArmies, getTotalTerritories, getRelation } from '../engine/GameState.js';
import { RESOURCE_DEFS, RESOURCE_IDS } from '../data/resources.js';
import { TECH_DEFS, TECH_BRANCHES } from '../data/techs.js';

const RESOURCE_ICONS = {
  oil: '🛢',
  uranium: '☢',
  rare_earths: '💎',
  titanium: '⚙',
};

const BRANCH_TECHS = {};
for (const [tid, td] of Object.entries(TECH_DEFS)) {
  if (!BRANCH_TECHS[td.branch]) BRANCH_TECHS[td.branch] = [];
  BRANCH_TECHS[td.branch].push({ id: tid, tier: td.tier });
}
for (const b of Object.keys(BRANCH_TECHS)) {
  BRANCH_TECHS[b].sort((a, b2) => a.tier - b2.tier);
}

export class EmpireStats {
  constructor(container) {
    this.container = container;
  }

  update(gameState) {
    const empires = Object.values(gameState.empires);
    const totalTerr = getTotalTerritories(gameState);
    const blocs = gameState.blocs || {};

    const stats = empires.map(e => {
      const territories = getEmpireTerritories(gameState, e.id);
      const armies = getEmpireArmies(gameState, e.id);
      const totalUnits = armies.reduce((s, a) => s + a.size, 0);
      const capitalIncome = territories.reduce((s, t) => s + (t.resources.capital || 0) + (t.buildings?.trade_office ? 2 : 0), 0);
      const terrPct = totalTerr > 0 ? (territories.length / totalTerr) * 100 : 0;
      const bloc = Object.values(blocs).find(b => b.members.includes(e.id));
      return { empire: e, terrCount: territories.length, terrPct, totalUnits, capitalIncome, bloc };
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

      const resourceHtml = this._buildResourceRow(e);
      const techHtml = this._buildTechDots(e);
      const blocTag = s.bloc ? `<span class="es-bloc-tag" title="${this._esc(s.bloc.name)}">⬡ ${this._esc(s.bloc.name)}</span>` : '';

      return `
      <div class="es-card${isLeader ? ' es-leader' : ''}${elim ? ' es-elim' : ''}">
        <div class="es-top">
          <span class="es-rank">#${rank + 1}</span>
          <span class="es-dot" style="background:${e.color}"></span>
          <span class="es-name" style="color:${e.color}">${this._esc(e.name)}</span>
          ${elim ? '<span class="es-elim-tag">ELIM</span>' : ''}
          ${blocTag}
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
        ${resourceHtml}
        ${techHtml}
        ${rels ? `<div class="es-rels">${rels}</div>` : ''}
      </div>`;
    }).join('');
  }

  _buildResourceRow(empire) {
    if (!empire.resources) return '';
    const items = RESOURCE_IDS.map(rid => {
      const r = empire.resources[rid];
      const icon = RESOURCE_ICONS[rid] || '?';
      const stockpile = r.stockpile || 0;
      const income = r.income || 0;
      if (stockpile === 0 && income === 0) return '';
      return `<span class="es-res" title="${RESOURCE_DEFS[rid].label}: ${stockpile} (+${income}/turn)">${icon}${stockpile}</span>`;
    }).filter(Boolean).join('');
    if (!items) return '';
    return `<div class="es-resources">${items}</div>`;
  }

  _buildTechDots(empire) {
    if (!empire.techs) return '';
    const completed = empire.techs.completed || [];
    const inProgress = empire.techs.inProgress || {};

    const branches = Object.entries(TECH_BRANCHES).map(([branchId, branch]) => {
      const techs = BRANCH_TECHS[branchId] || [];
      const dots = techs.map(t => {
        if (completed.includes(t.id)) {
          return `<span class="es-tech-dot es-tech-done" style="background:${branch.color}" title="${TECH_DEFS[t.id].label} ✓"></span>`;
        }
        if (inProgress[t.id]) {
          return `<span class="es-tech-dot es-tech-wip" style="border-color:${branch.color}" title="${TECH_DEFS[t.id].label} (researching)"></span>`;
        }
        return `<span class="es-tech-dot es-tech-locked" title="${TECH_DEFS[t.id].label}"></span>`;
      }).join('');
      return `<span class="es-tech-branch" title="${branch.label}">${dots}</span>`;
    }).join('');

    return `<div class="es-techs">${branches}</div>`;
  }

  _esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
