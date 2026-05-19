import { TERRAIN_MODIFIERS } from '../data/territories.js';

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

      const atWar = this._anyAtWar(Array.from(empireIds), state);
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

    const combatants = [];
    for (const [empireId, armies] of Object.entries(armyGroups)) {
      const totalSize = armies.reduce((sum, a) => sum + a.size, 0);
      const isDefender = empireId === isDefenderTerritory;
      const modifier = isDefender ? defenderBonus * capitalBonus : 1.0;
      const roll = 0.75 + Math.random() * 0.5;
      const score = totalSize * modifier * roll;

      combatants.push({ empireId, armies, totalSize, score, isDefender });
    }

    const warPairs = this._getWarPairs(Object.keys(armyGroups), state);

    combatants.sort((a, b) => b.score - a.score);

    for (const pair of warPairs) {
      const a = combatants.find(c => c.empireId === pair[0]);
      const b = combatants.find(c => c.empireId === pair[1]);
      if (!a || !b) continue;

      const winner = a.score >= b.score ? a : b;
      const loser = a.score >= b.score ? b : a;

      const loserMinLoss = Math.max(1, Math.floor(winner.totalSize * 0.3));
      const loserMaxLoss = winner.totalSize;
      const loserLoss = loserMinLoss + Math.floor(Math.random() * (loserMaxLoss - loserMinLoss + 1));

      const winnerMaxLoss = Math.max(1, Math.floor(loser.totalSize * 0.5));
      const winnerLoss = Math.floor(Math.random() * (winnerMaxLoss + 1));

      this._applyLosses(loser.armies, loserLoss, state);
      this._applyLosses(winner.armies, winnerLoss, state);

      loser.totalSize = loser.armies.reduce((s, a) => s + (state.armies[a.id]?.size || 0), 0);
      winner.totalSize = winner.armies.reduce((s, a) => s + (state.armies[a.id]?.size || 0), 0);

      const winnerEmpire = state.empires[winner.empireId];
      const loserEmpire = state.empires[loser.empireId];

      events.push({
        turn: state.meta.turn,
        type: 'battle',
        description: `${winnerEmpire.name} defeated ${loserEmpire.name} in ${territory.name}! (Lost ${winnerLoss} units, inflicted ${loserLoss} losses)`,
        involvedEmpires: [winner.empireId, loser.empireId],
        territoryId: territory.id,
      });

      if (loser.totalSize <= 0) {
        loser.armies.forEach(a => { delete state.armies[a.id]; });

        if (territory.ownerId === loser.empireId) {
          territory.ownerId = winner.empireId;

          events.push({
            turn: state.meta.turn,
            type: 'territory_captured',
            description: `${winnerEmpire.name} captured ${territory.name} from ${loserEmpire.name}!`,
            involvedEmpires: [winner.empireId, loser.empireId],
            territoryId: territory.id,
          });
        }
      }
    }

    for (const army of Object.values(state.armies)) {
      if (army.size <= 0) delete state.armies[army.id];
    }

    return events;
  }

  _getWarPairs(empireIds, state) {
    const pairs = [];
    for (let i = 0; i < empireIds.length; i++) {
      for (let j = i + 1; j < empireIds.length; j++) {
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
