import { deepClone, getEmpireTerritories, getTotalTerritories, getRelationKey } from './GameState.js';
import { CombatResolver } from './CombatResolver.js';
import { DiplomacyEngine } from './DiplomacyEngine.js';
import { EconomyEngine } from './EconomyEngine.js';
import { EventSystem } from './EventSystem.js';
import { ADJACENCY } from '../data/territories.js';

export class GameEngine {
  constructor() {
    this.combat = new CombatResolver();
    this.diplomacy = new DiplomacyEngine();
    this.economy = new EconomyEngine();
    this.events = new EventSystem();
  }

  resolveTurn(currentState) {
    const state = deepClone(currentState);
    const allActions = state.pendingActions;
    const movements = [];
    let allEvents = [];

    const diploResponseEvents = this.diplomacy.resolveIncomingProposals(state);
    allEvents.push(...diploResponseEvents);

    const matchingEvents = this.diplomacy.resolveMatchingProposals(state, allActions);
    allEvents.push(...matchingEvents);

    const breakActions = {};
    const warActions = {};
    const recruitActions = {};
    const moveActions = {};
    const otherActions = {};

    for (const [empireId, actions] of Object.entries(allActions)) {
      breakActions[empireId] = actions.filter(a => a.type === 'break_alliance');
      warActions[empireId] = actions.filter(a => a.type === 'declare_war');
      recruitActions[empireId] = actions.filter(a => a.type === 'recruit_units');
      moveActions[empireId] = actions.filter(a => a.type === 'move_army');
      otherActions[empireId] = actions.filter(a =>
        ['propose_trade', 'propose_alliance', 'propose_peace', 'send_message', 'espionage'].includes(a.type)
      );
    }

    allEvents.push(...this.diplomacy.processDiplomaticActions(state, breakActions));
    allEvents.push(...this.diplomacy.processDiplomaticActions(state, warActions));

    allEvents.push(...this.economy.processRecruitment(state, recruitActions));

    for (const [empireId, actions] of Object.entries(moveActions)) {
      for (const action of actions) {
        const result = this._processMovement(state, empireId, action);
        if (result.success) {
          movements.push(result.movement);
          allEvents.push(result.event);
        }
      }
    }

    const combatEvents = this.combat.resolve(state);
    allEvents.push(...combatEvents);

    allEvents.push(...this.economy.updateEconomy(state));

    const worldEvents = this.events.rollEvents(state);
    allEvents.push(...worldEvents);

    allEvents.push(...this.diplomacy.processDiplomaticActions(state, otherActions));

    this.diplomacy.updateReputations(state);

    allEvents.push(...this.economy.checkElimination(state));

    Object.values(state.armies).forEach(a => { a.movesRemaining = 1; });

    state.eventLog.push(...allEvents);
    if (state.eventLog.length > 200) {
      state.eventLog = state.eventLog.slice(-200);
    }

    state.diplomacyQueue = state.diplomacyQueue.filter(m =>
      m.turn >= state.meta.turn - 2
    );

    if (state.turnHistory.length >= 50) {
      state.turnHistory.shift();
    }
    state.turnHistory.push({
      turn: state.meta.turn,
      snapshot: deepClone(currentState),
    });

    state.meta.turn += 1;
    state.meta.lastUpdatedAt = new Date().toISOString();
    state.meta.phase = 'awaiting_advance';
    state.pendingActions = {};

    return { newState: state, events: allEvents, movements };
  }

  _processMovement(state, empireId, action) {
    const army = state.armies[action.army_id];
    if (!army || army.empireId !== empireId) {
      return { success: false };
    }
    if (army.movesRemaining <= 0) {
      return { success: false };
    }

    const from = army.locationId;
    const to = action.to;
    const adjacent = ADJACENCY[from];
    if (!adjacent || !adjacent.includes(to)) {
      return { success: false };
    }

    const rel = this._getRelationBetweenEmpires(state, empireId, state.territories[to]?.ownerId);
    if (rel && rel.status === 'alliance' && state.territories[to]?.ownerId) {
      return { success: false };
    }

    army.locationId = to;
    army.movesRemaining -= 1;

    const empire = state.empires[empireId];
    const toTerritory = state.territories[to];
    const toName = toTerritory ? toTerritory.name : to;

    if (toTerritory && !toTerritory.ownerId) {
      toTerritory.ownerId = empireId;
      return {
        success: true,
        movement: { armyId: army.id, empireId, from, to },
        event: {
          turn: state.meta.turn,
          type: 'territory_captured',
          description: `${empire.name} claimed the neutral territory of ${toName}!`,
          involvedEmpires: [empireId],
        },
      };
    }

    return {
      success: true,
      movement: { armyId: army.id, empireId, from, to },
      event: {
        turn: state.meta.turn,
        type: 'army_moved',
        description: `${empire.name} moved an army to ${toName}`,
        involvedEmpires: [empireId],
      },
    };
  }

  _getRelationBetweenEmpires(state, empireA, empireB) {
    if (!empireA || !empireB || empireA === empireB) return null;
    const key = getRelationKey(empireA, empireB);
    return state.relations[key] || null;
  }

  checkWinCondition(state) {
    const total = getTotalTerritories();
    const threshold = Math.ceil(total * 0.6);

    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;
      const count = getEmpireTerritories(state, empire.id).length;
      if (count >= threshold) {
        return { winner: empire, reason: 'domination', territories: count, total };
      }
    }

    if (state.meta.turn > state.meta.turnLimit) {
      let best = null;
      let bestCount = 0;
      for (const empire of Object.values(state.empires)) {
        if (empire.isEliminated) continue;
        const count = getEmpireTerritories(state, empire.id).length;
        if (count > bestCount) {
          bestCount = count;
          best = empire;
        }
      }
      if (best) {
        return { winner: best, reason: 'turn_limit', territories: bestCount, total };
      }
    }

    const alive = Object.values(state.empires).filter(e => !e.isEliminated);
    if (alive.length === 1) {
      const count = getEmpireTerritories(state, alive[0].id).length;
      return { winner: alive[0], reason: 'last_standing', territories: count, total };
    }

    return null;
  }
}
