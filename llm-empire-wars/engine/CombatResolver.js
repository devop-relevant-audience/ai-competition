import { TERRAIN_MODIFIERS } from '../data/territories.js';
import { adjustConfidence } from './GameState.js';

export function rollBuildingDestruction(territory) {
  const destroyed = [];
  if (!territory.buildings) return destroyed;
  for (const key of Object.keys(territory.buildings)) {
    if (!territory.buildings[key]) continue;
    if (Math.random() < 0.35) {
      delete territory.buildings[key];
      destroyed.push(key);
    }
  }
  return destroyed;
}

export class CombatResolver {
  resolve(state) {
    const events = [];
    const contestedTerritories = this._findContestedTerritories(state);

    for (const [tid, armyGroups] of Object.entries(contestedTerritories)) {
      const territory = state.territories[tid];
      const results = this._resolveBattle(territory, armyGroups, state);
      events.push(...results);
    }

    return events;
  }

  _findContestedTerritories(state) {
    const byLocation = {};
    for (const army of Object.values(state.armies)) {
      if (!byLocation[army.locationId]) byLocation[army.locationId] = [];
      byLocation[army.locationId].push(army);
    }

    const contested = {};
    for (const [tid, armies] of Object.entries(byLocation)) {
      const empireIds = new Set(armies.map(a => a.empireId));
      if (empireIds.size < 2) continue;

      const hasNeutral = empireIds.has('neutral');
      const atWar = hasNeutral || this._anyAtWar(Array.from(empireIds), state);
      if (!atWar) continue;

      contested[tid] = {};
      for (const army of armies) {
        if (!contested[tid][army.empireId]) contested[tid][army.empireId] = [];
        contested[tid][army.empireId].push(army);
      }
    }

    return contested;
  }

  _anyAtWar(empireIds, state) {
    for (let i = 0; i < empireIds.length; i++) {
      for (let j = i + 1; j < empireIds.length; j++) {
        const key = empireIds[i] < empireIds[j]
          ? `${empireIds[i]}__${empireIds[j]}`
          : `${empireIds[j]}__${empireIds[i]}`;
        const rel = state.relations[key];
        if (rel && rel.status === 'war') return true;
      }
    }
    return false;
  }

  _resolveBattle(territory, armyGroups, state) {
    const events = [];
    const terrain = territory.terrain || 'plains';
    const defenderBonus = TERRAIN_MODIFIERS[terrain]?.defense || 1.0;
    const capitalBonus = territory.capital ? TERRAIN_MODIFIERS.capital.defense : 1.0;
    const isDefenderTerritory = territory.ownerId;

    const empireIds = Object.keys(armyGroups);
    const coalitions = this._buildCoalitions(empireIds, state);

    const coalitionCombatants = coalitions.map(coalition => {
      let allArmies = [];
      let totalSize = 0;
      const memberNames = [];
      let isDefender = false;

      for (const eId of coalition) {
        const armies = armyGroups[eId] || [];
        allArmies = allArmies.concat(armies);
        totalSize += armies.reduce((sum, a) => sum + a.size, 0);
        if (eId === isDefenderTerritory) isDefender = true;
        const emp = state.empires[eId];
        if (emp) memberNames.push(emp.name);
        else if (eId === 'neutral') memberNames.push('Neutral garrison');
      }

      const fortressBonus = isDefender && territory.buildings?.bunker ? 0.3 : 0;
      const modifier = isDefender ? (defenderBonus + fortressBonus) * capitalBonus : 1.0;
      const roll = 0.75 + Math.random() * 0.5;
      const score = totalSize * modifier * roll;

      return {
        empireIds: coalition,
        leaderId: coalition[0],
        armies: allArmies,
        totalSize,
        score,
        isDefender,
        name: memberNames.join(' & '),
      };
    });

    const atWar = coalitionCombatants.length >= 2 && this._coalitionsAtWar(coalitions, state);
    if (!atWar) return events;

    coalitionCombatants.sort((a, b) => b.score - a.score);
    const winner = coalitionCombatants[0];
    const loser = coalitionCombatants[1];

    const loserMinLoss = Math.max(1, Math.floor(winner.totalSize * 0.3));
    const loserMaxLoss = winner.totalSize;
    const loserLoss = loserMinLoss + Math.floor(Math.random() * (loserMaxLoss - loserMinLoss + 1));

    const winnerMaxLoss = Math.max(1, Math.floor(loser.totalSize * 0.5));
    const winnerLoss = Math.floor(Math.random() * (winnerMaxLoss + 1));

    this._applyLosses(loser.armies, loserLoss, state);
    this._applyLosses(winner.armies, winnerLoss, state);

    loser.totalSize = loser.armies.reduce((s, a) => s + (state.armies[a.id]?.size || 0), 0);
    winner.totalSize = winner.armies.reduce((s, a) => s + (state.armies[a.id]?.size || 0), 0);

    const allInvolved = [...winner.empireIds, ...loser.empireIds].filter(id => id !== 'neutral');

    events.push({
      turn: state.meta.turn,
      type: 'battle',
      description: `${winner.name} defeated ${loser.name} in ${territory.name}! (Lost ${winnerLoss} units, inflicted ${loserLoss} losses)`,
      involvedEmpires: allInvolved,
      territoryId: territory.id,
      winnerLoss,
      loserLoss,
      winnerEmpireIds: [...winner.empireIds],
      loserEmpireIds: [...loser.empireIds],
    });

    for (const eId of winner.empireIds) {
      if (eId !== 'neutral' && state.empires[eId]) adjustConfidence(state.empires[eId], 5);
    }
    for (const eId of loser.empireIds) {
      if (eId !== 'neutral' && state.empires[eId]) adjustConfidence(state.empires[eId], -5);
    }

    if (loser.totalSize <= 0) {
      loser.armies.forEach(a => { delete state.armies[a.id]; });

      const loserHasNeutral = loser.empireIds.includes('neutral');
      const loserOwnsTerritory = loser.empireIds.includes(territory.ownerId) || (loserHasNeutral && !territory.ownerId);
      if (loserOwnsTerritory) {
        territory.ownerId = winner.leaderId === 'neutral' ? null : winner.leaderId;

        const destroyed = rollBuildingDestruction(territory);

        for (const eId of winner.empireIds) {
          if (eId !== 'neutral' && state.empires[eId]) adjustConfidence(state.empires[eId], 3);
        }
        for (const eId of loser.empireIds) {
          if (eId !== 'neutral' && state.empires[eId]) adjustConfidence(state.empires[eId], -3);
        }

        let captureDesc = `${winner.name} captured ${territory.name} from ${loser.name}!`;
        if (destroyed.length > 0) {
          captureDesc += ` (Destroyed: ${destroyed.join(', ')})`;
        }

        events.push({
          turn: state.meta.turn,
          type: 'territory_captured',
          description: captureDesc,
          involvedEmpires: winner.empireIds.filter(id => id !== 'neutral'),
          territoryId: territory.id,
        });
      }
    }

    for (const army of Object.values(state.armies)) {
      if (army.size <= 0) delete state.armies[army.id];
    }

    return events;
  }

  _buildCoalitions(empireIds, state) {
    const visited = new Set();
    const coalitions = [];

    for (const eId of empireIds) {
      if (visited.has(eId)) continue;
      const coalition = [eId];
      visited.add(eId);

      for (const otherId of empireIds) {
        if (visited.has(otherId)) continue;
        if (eId === 'neutral' || otherId === 'neutral') continue;

        const key = eId < otherId ? `${eId}__${otherId}` : `${otherId}__${eId}`;
        const rel = state.relations[key];
        if (rel && rel.status === 'alliance') {
          coalition.push(otherId);
          visited.add(otherId);
        }
      }

      coalitions.push(coalition);
    }

    return coalitions;
  }

  _coalitionsAtWar(coalitions, state) {
    for (let i = 0; i < coalitions.length; i++) {
      for (let j = i + 1; j < coalitions.length; j++) {
        for (const eA of coalitions[i]) {
          for (const eB of coalitions[j]) {
            if (eA === 'neutral' || eB === 'neutral') return true;
            const key = eA < eB ? `${eA}__${eB}` : `${eB}__${eA}`;
            const rel = state.relations[key];
            if (rel && rel.status === 'war') return true;
          }
        }
      }
    }
    return false;
  }

  _getWarPairs(empireIds, state) {
    const pairs = [];
    for (let i = 0; i < empireIds.length; i++) {
      for (let j = i + 1; j < empireIds.length; j++) {
        if (empireIds[i] === 'neutral' || empireIds[j] === 'neutral') {
          pairs.push([empireIds[i], empireIds[j]]);
          continue;
        }
        const key = empireIds[i] < empireIds[j]
          ? `${empireIds[i]}__${empireIds[j]}`
          : `${empireIds[j]}__${empireIds[i]}`;
        const rel = state.relations[key];
        if (rel && rel.status === 'war') {
          pairs.push([empireIds[i], empireIds[j]]);
        }
      }
    }
    return pairs;
  }

  _applyLosses(armies, totalLoss, state) {
    let remaining = totalLoss;
    for (const army of armies) {
      const live = state.armies[army.id];
      if (!live) continue;
      const loss = Math.min(live.size, remaining);
      live.size -= loss;
      remaining -= loss;
      if (remaining <= 0) break;
    }
  }
}
