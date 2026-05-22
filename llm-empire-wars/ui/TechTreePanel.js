import { TECH_DEFS, TECH_BRANCHES } from '../data/techs.js';

const BRANCH_ORDER = ['military', 'intelligence', 'shadow'];

const BRANCH_TECHS = {};
for (const [tid, td] of Object.entries(TECH_DEFS)) {
  if (!BRANCH_TECHS[td.branch]) BRANCH_TECHS[td.branch] = [];
  BRANCH_TECHS[td.branch].push({ id: tid, ...td });
}
for (const b of Object.keys(BRANCH_TECHS)) {
  BRANCH_TECHS[b].sort((a, b2) => a.tier - b2.tier);
}

export class TechTreePanel {
  constructor(container) {
    this.container = container;
  }

  update(gameState) {
    if (!gameState) return;

    const empires = Object.values(gameState.empires)
      .filter(e => !e.isEliminated)
      .sort((a, b) => {
        const aCount = (a.techs?.completed?.length || 0);
        const bCount = (b.techs?.completed?.length || 0);
        return bCount - aCount;
      });

    let html = `<div class="ttp-grid">`;
    html += `<div class="ttp-header-row">`;
    html += `<div class="ttp-corner"></div>`;

    for (const branchId of BRANCH_ORDER) {
      const branch = TECH_BRANCHES[branchId];
      const techs = BRANCH_TECHS[branchId] || [];
      for (const tech of techs) {
        html += `<div class="ttp-col-header" style="border-bottom-color:${branch.color}" title="${tech.label}: ${tech.description}">`;
        html += `<span class="ttp-tech-label">${tech.label}</span>`;
        html += `<span class="ttp-tech-tier" style="color:${branch.color}">T${tech.tier}</span>`;
        html += `</div>`;
      }
    }
    html += `</div>`;

    for (const empire of empires) {
      const completed = empire.techs?.completed || [];
      const inProgress = empire.techs?.inProgress || {};

      html += `<div class="ttp-row">`;
      html += `<div class="ttp-empire-cell">`;
      html += `<span class="ttp-empire-dot" style="background:${empire.color}"></span>`;
      html += `<span class="ttp-empire-name" style="color:${empire.color}">${this._esc(empire.name)}</span>`;
      html += `</div>`;

      for (const branchId of BRANCH_ORDER) {
        const branch = TECH_BRANCHES[branchId];
        const techs = BRANCH_TECHS[branchId] || [];
        for (const tech of techs) {
          let cls = 'ttp-cell-locked';
          let inner = '';
          if (completed.includes(tech.id)) {
            cls = 'ttp-cell-done';
            inner = `<span class="ttp-dot-done" style="background:${empire.color}"></span>`;
          } else if (inProgress[tech.id]) {
            cls = 'ttp-cell-wip';
            const prog = inProgress[tech.id];
            const turnsLeft = Math.max(0, prog.completesTurn - (gameState.meta?.turn || 0));
            inner = `<span class="ttp-dot-wip" style="border-color:${empire.color}" title="${turnsLeft} turns left"></span>`;
          } else {
            inner = `<span class="ttp-dot-empty"></span>`;
          }
          html += `<div class="ttp-cell ${cls}">${inner}</div>`;
        }
      }
      html += `</div>`;
    }

    html += `</div>`;
    this.container.innerHTML = html;
  }

  _esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
