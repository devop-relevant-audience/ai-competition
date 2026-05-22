import { getEmpireTerritories, getEmpireArmies, getRelation } from './GameState.js';

export class StatsTracker {
  constructor() {
    this.history = [];
    this.battleLog = {};
    this._pendingActionCounts = {};
  }

  /**
   * Call before resolveTurn to stash the action counts for this turn.
   * GameEngine calls this with the raw pendingActions map.
   */
  stageActionCounts(pendingActions) {
    this._pendingActionCounts = {};
    for (const [empireId, actions] of Object.entries(pendingActions)) {
      const counts = {};
      for (const a of actions) {
        counts[a.type] = (counts[a.type] || 0) + 1;
      }
      this._pendingActionCounts[empireId] = counts;
    }
  }

  recordTurn(gameState, turnEvents = []) {
    const turn = gameState.meta.turn;
    const empireSnapshots = {};
    const empireIds = Object.keys(gameState.empires);

    for (const empire of Object.values(gameState.empires)) {
      const territories = getEmpireTerritories(gameState, empire.id);
      const armies = getEmpireArmies(gameState, empire.id);
      const totalUnits = armies.reduce((s, a) => s + a.size, 0);

      const capitalIncome = territories.reduce((s, t) => s + (t.resources.capital || 0) + (t.buildings?.trade_office ? 2 : 0), 0);
      const industry = territories.reduce((s, t) => s + (t.resources.industry || 0) + (t.buildings?.factory ? 2 : 0), 0);
      const manpower = territories.reduce((s, t) => s + (t.resources.manpower || 0) + (t.buildings?.housing ? 2 : 0), 0);

      const buildingCounts = {};
      for (const t of territories) {
        for (const [bKey, bVal] of Object.entries(t.buildings || {})) {
          if (bVal) buildingCounts[bKey] = (buildingCounts[bKey] || 0) + 1;
        }
      }

      let wars = 0, alliances = 0, trades = 0;
      for (const otherId of empireIds) {
        if (otherId === empire.id) continue;
        const rel = getRelation(gameState, empire.id, otherId);
        if (!rel) continue;
        if (rel.status === 'war') wars++;
        if (rel.status === 'alliance') alliances++;
        if (rel.tradeValue > 0) trades++;
      }

      empireSnapshots[empire.id] = {
        territories: territories.length,
        units: totalUnits,
        armies: armies.length,
        treasury: empire.treasury,
        confidence: empire.confidence,
        capitalIncome,
        industry,
        manpower,
        isEliminated: empire.isEliminated,
        actionCounts: this._pendingActionCounts[empire.id] || {},
        buildings: buildingCounts,
        diplomacy: { wars, alliances, trades },
        resources: empire.resources ? { ...empire.resources } : {},
      };
    }

    for (const evt of turnEvents) {
      if (evt.type === 'battle') {
        for (const eid of (evt.involvedEmpires || [])) {
          if (!this.battleLog[eid]) this.battleLog[eid] = { fought: 0, won: 0, lost: 0 };
          this.battleLog[eid].fought++;
        }
        if (evt.winnerEmpireIds) {
          for (const eid of evt.winnerEmpireIds) {
            if (eid === 'neutral') continue;
            if (!this.battleLog[eid]) this.battleLog[eid] = { fought: 0, won: 0, lost: 0 };
            this.battleLog[eid].won++;
          }
        }
        if (evt.loserEmpireIds) {
          for (const eid of evt.loserEmpireIds) {
            if (eid === 'neutral') continue;
            if (!this.battleLog[eid]) this.battleLog[eid] = { fought: 0, won: 0, lost: 0 };
            this.battleLog[eid].lost++;
          }
        }
      }
    }

    this._pendingActionCounts = {};
    this.history.push({ turn, empires: empireSnapshots });
  }

  rebuildFromState(gameState) {
    this.history = [];
    this.battleLog = {};

    if (gameState.turnHistory) {
      for (const entry of gameState.turnHistory) {
        if (entry.snapshot) {
          const pseudoState = {
            ...entry.snapshot,
            meta: entry.snapshot.meta || { turn: entry.turn },
          };
          this.recordTurn(pseudoState, entry.events || []);
        }
      }
    }

    this.recordTurn(gameState, []);
  }

  getEmpireIds() {
    if (this.history.length === 0) return [];
    return Object.keys(this.history[0].empires);
  }

  getTurns() {
    return this.history.map(h => h.turn);
  }

  getSeries(empireId, metric) {
    return this.history.map(h => {
      const snap = h.empires[empireId];
      return snap ? (snap[metric] ?? 0) : 0;
    });
  }

  getLatest(empireId) {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1].empires[empireId] || null;
  }

  getBattleStats(empireId) {
    return this.battleLog[empireId] || { fought: 0, won: 0, lost: 0 };
  }

  getComputedScore(empireId) {
    return this.history.map(h => {
      const snap = h.empires[empireId];
      if (!snap) return 0;
      return (snap.territories * 100)
        + (snap.units * 10)
        + (snap.treasury * 2)
        + (snap.confidence * 3);
    });
  }

  getPeakTerritory(empireId) {
    let peak = 0;
    for (const h of this.history) {
      const snap = h.empires[empireId];
      if (snap && snap.territories > peak) peak = snap.territories;
    }
    return peak;
  }

  getPeakArmy(empireId) {
    let peak = 0;
    for (const h of this.history) {
      const snap = h.empires[empireId];
      if (snap && snap.units > peak) peak = snap.units;
    }
    return peak;
  }

  toJSON() {
    return { history: this.history, battleLog: this.battleLog };
  }

  fromJSON(data) {
    if (data) {
      this.history = data.history || [];
      this.battleLog = data.battleLog || {};
    }
  }
}
