import { getEmpireTerritories, getEmpireArmies } from './GameState.js';

export class StatsTracker {
  constructor() {
    this.history = [];
    this.battleLog = {};
  }

  recordTurn(gameState, turnEvents = []) {
    const turn = gameState.meta.turn;
    const empireSnapshots = {};

    for (const empire of Object.values(gameState.empires)) {
      const territories = getEmpireTerritories(gameState, empire.id);
      const armies = getEmpireArmies(gameState, empire.id);
      const totalUnits = armies.reduce((s, a) => s + a.size, 0);

      const goldIncome = territories.reduce((s, t) => s + (t.resources.gold || 0), 0);
      const foodIncome = territories.reduce((s, t) => s + (t.resources.food || 0), 0);
      const prodIncome = territories.reduce((s, t) => s + (t.resources.production || 0), 0);
      const manpower = territories.reduce((s, t) => s + (t.resources.manpower || 0) + (t.buildings?.housing ? 2 : 0), 0);

      empireSnapshots[empire.id] = {
        territories: territories.length,
        units: totalUnits,
        armies: armies.length,
        treasury: empire.treasury,
        reputation: empire.reputation,
        confidence: empire.confidence,
        goldIncome,
        foodIncome,
        prodIncome,
        manpower,
        isEliminated: empire.isEliminated,
      };
    }

    for (const evt of turnEvents) {
      if (evt.type === 'battle') {
        for (const eid of (evt.involvedEmpires || [])) {
          if (!this.battleLog[eid]) this.battleLog[eid] = { fought: 0, won: 0, lost: 0 };
          this.battleLog[eid].fought++;
        }
        if (evt.winner) {
          if (!this.battleLog[evt.winner]) this.battleLog[evt.winner] = { fought: 0, won: 0, lost: 0 };
          this.battleLog[evt.winner].won++;
        }
        if (evt.loser) {
          if (!this.battleLog[evt.loser]) this.battleLog[evt.loser] = { fought: 0, won: 0, lost: 0 };
          this.battleLog[evt.loser].lost++;
        }
      }
    }

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
        + (snap.reputation * 3);
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
