import { deepClone, getEmpireTerritories, getTotalTerritories, getRelationKey } from './GameState.js';
import { CombatResolver, rollBuildingDestruction } from './CombatResolver.js';
import { DiplomacyEngine } from './DiplomacyEngine.js';
import { EconomyEngine } from './EconomyEngine.js';
import { EventSystem } from './EventSystem.js';
import { ResearchEngine } from './ResearchEngine.js';
import { MissileEngine } from './MissileEngine.js';
import { IntelEngine } from './IntelEngine.js';
import { ShadowEngine } from './ShadowEngine.js';
import { BlocEngine } from './BlocEngine.js';
import { ADJACENCY } from '../data/territories.js';

export class GameEngine {
  constructor() {
    this.combat = new CombatResolver();
    this.diplomacy = new DiplomacyEngine();
    this.economy = new EconomyEngine();
    this.events = new EventSystem();
    this.research = new ResearchEngine();
    this.missile = new MissileEngine();
    this.intel = new IntelEngine();
    this.shadow = new ShadowEngine();
    this.bloc = new BlocEngine();
  }

  resolveTurn(currentState) {
    const state = this._cloneStateForResolution(currentState);
    const allActions = state.pendingActions;
    const movements = [];
    let allEvents = [];

    const breakActions = {};
    const warActions = {};
    const buildActions = {};
    const recruitActions = {};
    const researchActions = {};
    const moveActions = {};
    const otherActions = {};

    const embargoActions = {};
    const buildMissileActions = {};
    const launchMissileActions = {};
    const buildNukeActions = {};
    const launchNukeActions = {};
    const uavReconActions = {};
    const launchSatelliteActions = {};
    const shadowActions = {};
    const blocActions = {};

    for (const [empireId, actions] of Object.entries(allActions)) {
      breakActions[empireId] = actions.filter(a => a.type === 'break_alliance');
      warActions[empireId] = actions.filter(a => a.type === 'declare_war');
      embargoActions[empireId] = actions.filter(a => a.type === 'impose_embargo' || a.type === 'lift_embargo');
      buildActions[empireId] = actions.filter(a => a.type === 'build');
      recruitActions[empireId] = actions.filter(a => a.type === 'recruit_units');
      researchActions[empireId] = actions.filter(a => a.type === 'research');
      buildMissileActions[empireId] = actions.filter(a => a.type === 'build_missile');
      launchMissileActions[empireId] = actions.filter(a => a.type === 'launch_missile');
      buildNukeActions[empireId] = actions.filter(a => a.type === 'build_nuke');
      launchNukeActions[empireId] = actions.filter(a => a.type === 'launch_nuke');
      uavReconActions[empireId] = actions.filter(a => a.type === 'uav_recon');
      launchSatelliteActions[empireId] = actions.filter(a => a.type === 'launch_satellite');
      shadowActions[empireId] = actions.filter(a => ['fund_insurgency', 'hack_grid', 'sabotage'].includes(a.type));
      blocActions[empireId] = actions.filter(a => ['form_bloc', 'invite_bloc', 'leave_bloc', 'bloc_embargo'].includes(a.type));
      moveActions[empireId] = actions.filter(a => a.type === 'move_army');
      otherActions[empireId] = actions.filter(a =>
        ['propose_trade', 'propose_alliance', 'propose_peace', 'send_message'].includes(a.type)
      );
    }

    // 1. Break alliances
    allEvents.push(...this.diplomacy.processDiplomaticActions(state, breakActions));
    // 2. Declare war (+ bloc mutual defense)
    allEvents.push(...this.diplomacy.processDiplomaticActions(state, warActions));
    // 3. Embargoes (including bloc embargoes)
    allEvents.push(...this.diplomacy.processDiplomaticActions(state, embargoActions));
    allEvents.push(...this.bloc.processBlocEmbargo(state, blocActions));
    // 4. Bloc actions (form, invite, leave)
    allEvents.push(...this.bloc.processFormBloc(state, blocActions));
    allEvents.push(...this.bloc.processInviteBloc(state, blocActions));
    allEvents.push(...this.bloc.processLeaveBloc(state, blocActions));
    // 5. Build actions (buildings)
    allEvents.push(...this.economy.processBuilding(state, buildActions));
    // 6. Recruit
    allEvents.push(...this.economy.processRecruitment(state, recruitActions));
    // 7. Research
    allEvents.push(...this.research.processResearchActions(state, researchActions));
    // 8. Build missiles/nukes
    allEvents.push(...this.missile.processBuildMissile(state, buildMissileActions));
    allEvents.push(...this.missile.processBuildNuke(state, buildNukeActions));
    // 9. Shadow operations
    allEvents.push(...this.shadow.processFundInsurgency(state, shadowActions));
    allEvents.push(...this.shadow.processHackGrid(state, shadowActions));
    allEvents.push(...this.shadow.processSabotage(state, shadowActions));
    // 10. Intel (UAV, satellite)
    allEvents.push(...this.intel.processUavRecon(state, uavReconActions));
    allEvents.push(...this.intel.processLaunchSatellite(state, launchSatelliteActions));
    // 11. Launch missiles/nukes
    const missileResult = this.missile.processLaunchMissile(state, launchMissileActions);
    allEvents.push(...missileResult.events);
    const missileFlights = missileResult.missileFlights;

    const nukeResult = this.missile.processLaunchNuke(state, launchNukeActions);
    allEvents.push(...nukeResult.events);
    missileFlights.push(...nukeResult.missileFlights);
    // 12. Movement
    for (const [empireId, actions] of Object.entries(moveActions)) {
      for (const action of actions) {
        const result = this._processMovement(state, empireId, action);
        if (result.success) {
          movements.push(result.movement);
          allEvents.push(result.event);
        }
      }
    }
    // 13. Combat
    const combatEvents = this.combat.resolve(state);
    allEvents.push(...combatEvents);
    // 14. Research completion + resource income + intel expiry
    allEvents.push(...this.research.updateResearch(state));
    this.research.updateResourceIncome(state);
    this.intel.expireIntel(state);
    // 15. Economy update (respects gridDown events)
    allEvents.push(...this.economy.updateEconomy(state));
    // 16. World events
    const worldEvents = this.events.rollEvents(state);
    allEvents.push(...worldEvents);
    // 17. Proposals (trade, alliance, peace, messages)
    allEvents.push(...this.diplomacy.processDiplomaticActions(state, otherActions));

    this.diplomacy.updateReputations(state);
    // 18. Bloc integrity check
    allEvents.push(...this.bloc.checkBlocIntegrity(state));
    // 19. Elimination check
    allEvents.push(...this.economy.checkElimination(state));

    Object.values(state.armies).forEach(a => {
      a.movesRemaining = a.empireId === 'neutral' ? 0 : 1;
    });

    state.eventLog.push(...allEvents);
    if (state.eventLog.length > 200) {
      state.eventLog = state.eventLog.slice(-200);
    }

    state.diplomacyQueue = state.diplomacyQueue.filter(m =>
      m.turn >= state.meta.turn - 2
    );

    state.turnHistory.push({
      turn: state.meta.turn,
      snapshot: this._createLightSnapshot(currentState),
      events: allEvents,
    });

    state.meta.turn += 1;
    state.meta.lastUpdatedAt = new Date().toISOString();
    state.meta.phase = 'awaiting_advance';
    state.pendingActions = {};

    return { newState: state, events: allEvents, movements, missileFlights };
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
    if (!state.territories[to]) {
      return { success: false };
    }
    const adjacent = ADJACENCY[from];
    if (!adjacent || !adjacent.includes(to)) {
      return { success: false };
    }

    const toTerritory = state.territories[to];
    if (toTerritory.wasteland) {
      army.locationId = to;
      army.movesRemaining -= 1;
      const empire = state.empires[empireId];
      return {
        success: true,
        movement: { armyId: army.id, empireId, from, to },
        event: {
          turn: state.meta.turn,
          type: 'army_moved',
          description: `${empire.name} moved an army through the wasteland of ${toTerritory.name}`,
          involvedEmpires: [empireId],
        },
      };
    }

    const toOwner = state.territories[to]?.ownerId;
    if (toOwner && toOwner !== empireId) {
      const rel = this._getRelationBetweenEmpires(state, empireId, toOwner);
      if (!rel || rel.status === 'alliance') {
        return { success: false };
      }
      if (rel.status !== 'war') {
        return { success: false };
      }
    }

    army.locationId = to;
    army.movesRemaining -= 1;

    const empire = state.empires[empireId];
    const toName = toTerritory ? toTerritory.name : to;

    const neutralGarrison = Object.values(state.armies).find(
      a => a.locationId === to && a.empireId === 'neutral'
    );

    if (toTerritory && !toTerritory.ownerId && !neutralGarrison) {
      toTerritory.ownerId = empireId;
      if (toTerritory.missiles) toTerritory.missiles = 0;
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

    if (toTerritory && toOwner && toOwner !== empireId) {
      const hasDefenders = Object.values(state.armies).some(
        a => a.locationId === to && a.empireId === toOwner
      );
      if (!hasDefenders) {
        const previousOwner = state.empires[toOwner];
        toTerritory.ownerId = empireId;
        if (toTerritory.missiles) toTerritory.missiles = 0;
        const destroyed = rollBuildingDestruction(toTerritory);
        let desc = `${empire.name} captured the undefended ${toName} from ${previousOwner?.name || 'unknown'}!`;
        if (destroyed.length > 0) {
          desc += ` (Destroyed: ${destroyed.join(', ')})`;
        }
        return {
          success: true,
          movement: { armyId: army.id, empireId, from, to },
          event: {
            turn: state.meta.turn,
            type: 'territory_captured',
            description: desc,
            involvedEmpires: [empireId, toOwner],
          },
        };
      }
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

  _cloneStateForResolution(state) {
    const history = state.turnHistory;
    state.turnHistory = [];
    const cloned = deepClone(state);
    state.turnHistory = history;
    cloned.turnHistory = history;
    return cloned;
  }

  _createLightSnapshot(state) {
    const { turnHistory, eventLog, ...rest } = state;
    return deepClone(rest);
  }

  checkWinCondition(state) {
    const total = getTotalTerritories(state);
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
