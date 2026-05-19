import { getEmpireTerritories, getEmpireArmies } from './GameState.js';

export class EconomyEngine {
  processRecruitment(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      const recruitActions = actions.filter(a => a.type === 'recruit_units');
      for (const action of recruitActions) {
        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;

        const maxRecruit = Math.floor(territory.resources.production / 2);
        const amount = Math.min(action.amount || 0, maxRecruit);
        const goldCost = amount * 1;
        const prodCost = amount * 2;

        if (amount <= 0) continue;
        if (empire.treasury < goldCost) continue;

        empire.treasury -= goldCost;

        const existingArmy = Object.values(state.armies)
          .find(a => a.empireId === empireId && a.locationId === action.territory_id);

        if (existingArmy) {
          existingArmy.size += amount;
        } else {
          const armyId = `army_${empireId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          state.armies[armyId] = {
            id: armyId,
            empireId,
            locationId: action.territory_id,
            size: amount,
            movesRemaining: 0,
          };
        }

        events.push({
          turn: state.meta.turn,
          type: 'recruitment',
          description: `${empire.name} recruited ${amount} units in ${territory.name}`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  updateEconomy(state) {
    const events = [];

    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;

      const territories = getEmpireTerritories(state, empire.id);
      const armies = getEmpireArmies(state, empire.id);

      let goldIncome = 0;
      let totalFood = 0;
      territories.forEach(t => {
        let foodMod = 0;
        let goldMod = 0;
        state.activeEvents.forEach(evt => {
          if (evt.affectedTerritoryId === t.id) {
            foodMod += evt.effect.food || 0;
            goldMod += evt.effect.gold || 0;
          }
        });
        goldIncome += t.resources.gold + goldMod;
        totalFood += t.resources.food + foodMod;
      });

      let tradeIncome = 0;
      for (const rel of Object.values(state.relations)) {
        if (rel.status === 'trade' || rel.status === 'alliance') {
          if (rel.empireA === empire.id || rel.empireB === empire.id) {
            tradeIncome += rel.tradeValue;
          }
        }
      }

      const totalUnits = armies.reduce((sum, a) => sum + a.size, 0);
      const armyUpkeep = Math.floor(totalUnits * 0.5);

      empire.treasury += goldIncome + tradeIncome - armyUpkeep;
      empire.treasury = Math.max(0, empire.treasury);

      const foodNeeded = totalUnits;
      if (totalFood < foodNeeded && armies.length > 0) {
        const deficit = foodNeeded - totalFood;
        const attritionPerArmy = Math.max(1, Math.floor(deficit / armies.length));

        for (const army of armies) {
          const live = state.armies[army.id];
          if (!live) continue;
          live.size = Math.max(1, live.size - attritionPerArmy);
        }

        events.push({
          turn: state.meta.turn,
          type: 'attrition',
          description: `${empire.name} suffers food shortage! Armies lose strength.`,
          involvedEmpires: [empire.id],
        });
      }
    }

    return events;
  }

  checkElimination(state) {
    const events = [];

    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;
      const territories = getEmpireTerritories(state, empire.id);
      const armies = getEmpireArmies(state, empire.id);

      if (territories.length === 0 && armies.length === 0) {
        empire.isEliminated = true;
        events.push({
          turn: state.meta.turn,
          type: 'elimination',
          description: `${empire.name} has been eliminated!`,
          involvedEmpires: [empire.id],
        });
      }
    }

    return events;
  }
}
