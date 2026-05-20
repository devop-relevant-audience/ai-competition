import { getEmpireTerritories, getEmpireArmies, adjustConfidence } from './GameState.js';
import { BUILDING_DEFS } from '../data/territories.js';

export class EconomyEngine {
  processBuilding(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      const buildActions = actions.filter(a => a.type === 'build');
      for (const action of buildActions) {
        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;

        const def = BUILDING_DEFS[action.building];
        if (!def) continue;

        if (!territory.buildings) territory.buildings = {};
        if (territory.buildings[action.building]) continue;

        if (empire.treasury < def.cost) continue;

        empire.treasury -= def.cost;
        territory.buildings[action.building] = true;

        events.push({
          turn: state.meta.turn,
          type: 'building_constructed',
          description: `${empire.name} built a ${def.label} in ${territory.name}`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  processRecruitment(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      const recruitActions = actions.filter(a => a.type === 'recruit_units');
      for (const action of recruitActions) {
        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;

        const effectiveProd = territory.resources.production + (territory.buildings?.barracks ? 2 : 0);
        const maxRecruit = Math.floor(effectiveProd / 2);
        const amount = Math.min(action.amount || 0, maxRecruit);
        const goldCost = amount * 3;

        if (amount <= 0) continue;
        if (empire.treasury < goldCost) continue;

        empire.treasury -= goldCost;

        const existingArmy = Object.values(state.armies)
          .find(a => a.empireId === empireId && a.locationId === action.territory_id && !a.isMercenary);

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
            isMercenary: false,
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

  processMercenaries(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      const mercActions = actions.filter(a => a.type === 'hire_mercenaries');
      for (const action of mercActions) {
        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;

        const maxAffordable = Math.floor(empire.treasury / 6);
        const amount = Math.min(action.amount || 0, 3, maxAffordable);

        if (amount <= 0) continue;

        empire.treasury -= amount * 6;

        const existingMerc = Object.values(state.armies)
          .find(a => a.empireId === empireId && a.locationId === action.territory_id && a.isMercenary);

        if (existingMerc) {
          existingMerc.size += amount;
        } else {
          const armyId = `army_${empireId}_merc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          state.armies[armyId] = {
            id: armyId,
            empireId,
            locationId: action.territory_id,
            size: amount,
            movesRemaining: 0,
            isMercenary: true,
          };
        }

        events.push({
          turn: state.meta.turn,
          type: 'mercenaries_hired',
          description: `${empire.name} hired ${amount} mercenaries in ${territory.name}`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  processBuyFood(state, allActions) {
    const foodBonusMap = new Map();

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      const buyActions = actions.filter(a => a.type === 'buy_food');
      if (buyActions.length === 0) continue;

      const action = buyActions[0];
      const maxAffordable = Math.floor(empire.treasury / 3);
      const amount = Math.min(action.amount || 0, 5, maxAffordable);

      if (amount <= 0) continue;

      empire.treasury -= amount * 3;
      foodBonusMap.set(empireId, amount);

      state.eventLog.push({
        turn: state.meta.turn,
        type: 'food_purchased',
        description: `${empire.name} purchased ${amount} food for ${amount * 3} gold`,
        involvedEmpires: [empireId],
      });
    }

    return foodBonusMap;
  }

  updateEconomy(state, foodBonusMap = new Map()) {
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
        goldIncome += t.resources.gold + goldMod + (t.buildings?.market ? 2 : 0);
        totalFood += t.resources.food + foodMod + (t.buildings?.farm ? 2 : 0);
      });

      const bonusFood = foodBonusMap.get(empire.id) || 0;
      totalFood += bonusFood;

      let tradeIncome = 0;
      for (const rel of Object.values(state.relations)) {
        if (rel.status === 'trade' || rel.status === 'alliance') {
          if (rel.empireA === empire.id || rel.empireB === empire.id) {
            tradeIncome += rel.tradeValue;
          }
        }
      }

      const regularUnits = armies.filter(a => !a.isMercenary).reduce((s, a) => s + a.size, 0);
      const mercUnits = armies.filter(a => a.isMercenary).reduce((s, a) => s + a.size, 0);
      const armyUpkeep = Math.floor(regularUnits * 0.5) + (mercUnits * 1);

      empire.treasury += goldIncome + tradeIncome - armyUpkeep;
      empire.treasury = Math.max(0, empire.treasury);

      const foodNeeded = regularUnits;
      const regularArmies = armies.filter(a => !a.isMercenary);
      if (totalFood < foodNeeded && regularArmies.length > 0) {
        const deficit = foodNeeded - totalFood;
        const attritionPerArmy = Math.max(1, Math.floor(deficit / regularArmies.length));

        for (const army of regularArmies) {
          const live = state.armies[army.id];
          if (!live) continue;
          live.size = Math.max(1, live.size - attritionPerArmy);
        }

        adjustConfidence(empire, -3);
        events.push({
          turn: state.meta.turn,
          type: 'attrition',
          description: `${empire.name} suffers food shortage! Armies lose strength.`,
          involvedEmpires: [empire.id],
        });
      }

      if (empire.treasury <= 0 && mercUnits > 0) {
        const mercArmies = armies.filter(a => a.isMercenary);
        for (const army of mercArmies) {
          const live = state.armies[army.id];
          if (!live) continue;
          live.size -= 1;
          if (live.size <= 0) {
            delete state.armies[army.id];
          }
        }
        events.push({
          turn: state.meta.turn,
          type: 'mercenaries_deserted',
          description: `${empire.name} is bankrupt! Mercenaries desert.`,
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

      if (territories.length === 0) {
        empire.isEliminated = true;

        const stragglers = getEmpireArmies(state, empire.id);
        for (const army of stragglers) {
          delete state.armies[army.id];
        }

        events.push({
          turn: state.meta.turn,
          type: 'elimination',
          description: `${empire.name} has been eliminated! Their last territory has fallen and all remaining forces have disbanded.`,
          involvedEmpires: [empire.id],
        });
      }
    }

    return events;
  }
}
