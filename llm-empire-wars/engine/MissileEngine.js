import { getRelation, adjustConfidence } from './GameState.js';

const SILO_CAPACITY = 3;
const BUILD_MISSILE_COST = { capital: 5, oil: 1 };
const BUILD_NUKE_COST = { capital: 12, uranium: 2 };

const CONVENTIONAL = { minKill: 2, maxKill: 4, buildingDestroyChance: 0.25 };
const SAM_INTERCEPT_CHANCE = 0.60;

export class MissileEngine {

  processBuildMissile(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('ballistic_missiles')) continue;

      for (const action of actions) {
        if (action.type !== 'build_missile') continue;

        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;
        if (!territory.buildings?.missile_silo) continue;

        const currentTotal = (territory.missiles || 0) + (territory.nukes || 0);
        if (currentTotal >= SILO_CAPACITY) continue;

        if (empire.treasury < BUILD_MISSILE_COST.capital) continue;
        const oilStock = empire.resources?.oil?.stockpile || 0;
        if (oilStock < BUILD_MISSILE_COST.oil) continue;

        empire.treasury -= BUILD_MISSILE_COST.capital;
        empire.resources.oil.stockpile -= BUILD_MISSILE_COST.oil;
        territory.missiles = (territory.missiles || 0) + 1;

        events.push({
          turn: state.meta.turn,
          type: 'missile_built',
          description: `${empire.name} manufactured a conventional missile in ${territory.name} (${(territory.missiles || 0) + (territory.nukes || 0)}/${SILO_CAPACITY})`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  processBuildNuke(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('nuclear_arsenal')) continue;

      for (const action of actions) {
        if (action.type !== 'build_nuke') continue;

        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;
        if (!territory.buildings?.missile_silo) continue;

        const currentTotal = (territory.missiles || 0) + (territory.nukes || 0);
        if (currentTotal >= SILO_CAPACITY) continue;

        if (empire.treasury < BUILD_NUKE_COST.capital) continue;
        const uraniumStock = empire.resources?.uranium?.stockpile || 0;
        if (uraniumStock < BUILD_NUKE_COST.uranium) continue;

        empire.treasury -= BUILD_NUKE_COST.capital;
        empire.resources.uranium.stockpile -= BUILD_NUKE_COST.uranium;
        territory.nukes = (territory.nukes || 0) + 1;

        events.push({
          turn: state.meta.turn,
          type: 'nuke_built',
          description: `${empire.name} manufactured a NUCLEAR warhead in ${territory.name} (${(territory.missiles || 0) + (territory.nukes || 0)}/${SILO_CAPACITY})`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  processLaunchMissile(state, allActions) {
    const events = [];
    const missileFlights = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('ballistic_missiles')) continue;

      for (const action of actions) {
        if (action.type !== 'launch_missile') continue;

        const fromTerritory = state.territories[action.from_territory_id];
        if (!fromTerritory || fromTerritory.ownerId !== empireId) continue;
        if (!fromTerritory.buildings?.missile_silo) continue;
        if ((fromTerritory.missiles || 0) <= 0) continue;

        const targetTerritory = state.territories[action.target_territory_id];
        if (!targetTerritory) continue;

        const targetOwner = targetTerritory.ownerId;
        if (targetOwner === empireId) continue;
        if (targetOwner && targetOwner !== 'neutral') {
          const rel = getRelation(state, empireId, targetOwner);
          if (!rel || rel.status !== 'war') continue;
        }

        fromTerritory.missiles -= 1;

        const { strikeEvents, flight } = this._resolveStrike(
          state, empire, action.from_territory_id, action.target_territory_id
        );
        events.push(...strikeEvents);
        missileFlights.push(flight);
      }
    }

    return { events, missileFlights };
  }

  processLaunchNuke(state, allActions) {
    const events = [];
    const missileFlights = [];
    const retaliatedAgainst = new Set();

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('nuclear_arsenal')) continue;

      for (const action of actions) {
        if (action.type !== 'launch_nuke') continue;

        const fromTerritory = state.territories[action.from_territory_id];
        if (!fromTerritory || fromTerritory.ownerId !== empireId) continue;
        if (!fromTerritory.buildings?.missile_silo) continue;
        if ((fromTerritory.nukes || 0) <= 0) continue;

        const targetTerritory = state.territories[action.target_territory_id];
        if (!targetTerritory) continue;
        if (targetTerritory.wasteland) continue;

        const targetOwner = targetTerritory.ownerId;
        if (targetOwner === empireId) continue;
        if (targetOwner && targetOwner !== 'neutral') {
          const rel = getRelation(state, empireId, targetOwner);
          if (!rel || rel.status !== 'war') continue;
        }

        fromTerritory.nukes -= 1;

        const result = this._resolveNuclearStrike(
          state, empire, action.from_territory_id, action.target_territory_id, retaliatedAgainst
        );
        events.push(...result.events);
        missileFlights.push(...result.flights);
      }
    }

    return { events, missileFlights };
  }

  _resolveStrike(state, attackerEmpire, fromTid, targetTid) {
    const strikeEvents = [];
    const targetTerritory = state.territories[targetTid];
    const targetOwner = targetTerritory.ownerId;
    const targetEmpire = targetOwner ? state.empires[targetOwner] : null;
    const targetName = targetTerritory.name;
    const attackerName = attackerEmpire.name;

    const flight = {
      from: fromTid,
      to: targetTid,
      empireId: attackerEmpire.id,
      isNuclear: false,
      intercepted: false,
    };

    if (targetTerritory.buildings?.sam_battery) {
      if (Math.random() < SAM_INTERCEPT_CHANCE) {
        flight.intercepted = true;

        strikeEvents.push({
          turn: state.meta.turn,
          type: 'missile_intercepted',
          description: `SAM battery in ${targetName} intercepted a missile from ${attackerName}!`,
          involvedEmpires: [attackerEmpire.id, ...(targetOwner ? [targetOwner] : [])],
        });

        if (targetEmpire) adjustConfidence(targetEmpire, 3);

        return { strikeEvents, flight };
      }
    }

    const kills = this._applyMissileDamage(state, targetTid, CONVENTIONAL.minKill, CONVENTIONAL.maxKill);
    const destroyed = this._applyBuildingDestruction(targetTerritory, CONVENTIONAL.buildingDestroyChance);

    let desc = `${attackerName} launched a missile strike on ${targetName}!`;
    if (kills > 0) desc += ` ${kills} units destroyed.`;
    if (destroyed.length > 0) desc += ` Buildings destroyed: ${destroyed.join(', ')}.`;

    strikeEvents.push({
      turn: state.meta.turn,
      type: 'missile_impact',
      description: desc,
      involvedEmpires: [attackerEmpire.id, ...(targetOwner ? [targetOwner] : [])],
      territoryId: targetTid,
    });

    adjustConfidence(attackerEmpire, 5);
    if (targetEmpire) adjustConfidence(targetEmpire, -8);

    return { strikeEvents, flight };
  }

  _resolveNuclearStrike(state, attackerEmpire, fromTid, targetTid, retaliatedAgainst, isRetaliation = false) {
    const events = [];
    const flights = [];
    const targetTerritory = state.territories[targetTid];
    const targetOwner = targetTerritory.ownerId;
    const targetEmpire = targetOwner ? state.empires[targetOwner] : null;
    const targetName = targetTerritory.name;
    const attackerName = attackerEmpire.name;

    const flight = {
      from: fromTid,
      to: targetTid,
      empireId: attackerEmpire.id,
      isNuclear: true,
      intercepted: false,
      isRetaliation,
    };
    flights.push(flight);

    if (targetTerritory.buildings?.sam_battery) {
      if (Math.random() < SAM_INTERCEPT_CHANCE) {
        flight.intercepted = true;

        events.push({
          turn: state.meta.turn,
          type: 'missile_intercepted',
          description: `SAM battery in ${targetName} intercepted a NUCLEAR missile from ${attackerName}!`,
          involvedEmpires: [attackerEmpire.id, ...(targetOwner ? [targetOwner] : [])],
        });

        if (targetEmpire) adjustConfidence(targetEmpire, 3);
        return { events, flights };
      }
    }

    const kills = this._annihilateArmies(state, targetTid);

    const wasCapital = targetTerritory.capital;
    targetTerritory.terrain = 'wasteland';
    targetTerritory.resources = { manpower: 0, industry: 0, capital: 0 };
    targetTerritory.buildings = {};
    targetTerritory.missiles = 0;
    targetTerritory.nukes = 0;
    targetTerritory.ownerId = null;
    targetTerritory.wasteland = true;
    targetTerritory.capital = false;

    state.activeEvents = state.activeEvents.filter(
      e => e.affectedTerritoryId !== targetTid
    );

    let desc = isRetaliation
      ? `☢️ MAD RETALIATION: ${attackerName} auto-fired a nuclear missile at ${targetName}!`
      : `☢️ NUCLEAR STRIKE: ${attackerName} hit ${targetName} with a nuclear warhead!`;
    desc += ` ${kills} units annihilated. Territory is now PERMANENT WASTELAND.`;
    if (wasCapital && targetEmpire) {
      desc += ` ${targetEmpire.name} has lost their capital!`;
    }

    events.push({
      turn: state.meta.turn,
      type: 'nuclear_impact',
      description: desc,
      involvedEmpires: [attackerEmpire.id, ...(targetOwner ? [targetOwner] : [])],
      territoryId: targetTid,
    });

    adjustConfidence(attackerEmpire, 8);
    if (targetEmpire) adjustConfidence(targetEmpire, -25);

    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;
      if (empire.id === attackerEmpire.id || empire.id === targetOwner) continue;
      adjustConfidence(empire, -10);
    }

    events.push({
      turn: state.meta.turn,
      type: 'nuclear_panic',
      description: `Global panic: nuclear strike on ${targetName} shakes confidence worldwide.`,
      involvedEmpires: Object.keys(state.empires),
    });

    if (!isRetaliation && targetEmpire && !targetEmpire.isEliminated &&
        targetEmpire.techs?.completed?.includes('nuclear_arsenal') &&
        !retaliatedAgainst.has(attackerEmpire.id)) {

      const retaliationSource = this._findNukeSource(state, targetOwner);
      if (retaliationSource) {
        retaliatedAgainst.add(attackerEmpire.id);

        const retaliationTarget = this._findRetaliationTarget(state, attackerEmpire.id);
        if (retaliationTarget) {
          retaliationSource.territory.nukes -= 1;

          const retResult = this._resolveNuclearStrike(
            state, targetEmpire, retaliationSource.territory.id,
            retaliationTarget, retaliatedAgainst, true
          );
          events.push(...retResult.events);
          flights.push(...retResult.flights);
        }
      }
    }

    return { events, flights };
  }

  _annihilateArmies(state, targetTid) {
    const armies = Object.values(state.armies).filter(a => a.locationId === targetTid);
    let totalKilled = 0;
    for (const army of armies) {
      totalKilled += army.size;
      delete state.armies[army.id];
    }
    return totalKilled;
  }

  _findNukeSource(state, empireId) {
    for (const territory of Object.values(state.territories)) {
      if (territory.ownerId !== empireId) continue;
      if ((territory.nukes || 0) > 0 && territory.buildings?.missile_silo) {
        return { territory };
      }
    }
    return null;
  }

  _findRetaliationTarget(state, attackerEmpireId) {
    const territories = Object.values(state.territories).filter(
      t => t.ownerId === attackerEmpireId && !t.wasteland
    );
    if (territories.length === 0) return null;

    const capital = territories.find(t => t.capital);
    if (capital) return capital.id;

    territories.sort((a, b) => {
      const valueA = a.resources.capital + a.resources.industry + a.resources.manpower;
      const valueB = b.resources.capital + b.resources.industry + b.resources.manpower;
      return valueB - valueA;
    });
    return territories[0].id;
  }

  _applyMissileDamage(state, targetTid, minKill, maxKill) {
    const armies = Object.values(state.armies).filter(a => a.locationId === targetTid);
    if (armies.length === 0) return 0;

    const totalKill = minKill + Math.floor(Math.random() * (maxKill - minKill + 1));
    let remaining = totalKill;
    let actualKills = 0;

    for (const army of armies) {
      const live = state.armies[army.id];
      if (!live || live.size <= 0) continue;
      const loss = Math.min(live.size, remaining);
      live.size -= loss;
      remaining -= loss;
      actualKills += loss;
      if (live.size <= 0) delete state.armies[army.id];
      if (remaining <= 0) break;
    }

    return actualKills;
  }

  _applyBuildingDestruction(territory, chance) {
    const destroyed = [];
    if (!territory.buildings) return destroyed;
    for (const key of Object.keys(territory.buildings)) {
      if (!territory.buildings[key]) continue;
      if (key === 'missile_silo' && ((territory.missiles || 0) > 0 || (territory.nukes || 0) > 0)) {
        if (Math.random() < chance) {
          delete territory.buildings[key];
          territory.missiles = 0;
          territory.nukes = 0;
          destroyed.push(key);
        }
        continue;
      }
      if (Math.random() < chance) {
        delete territory.buildings[key];
        destroyed.push(key);
      }
    }
    return destroyed;
  }
}
