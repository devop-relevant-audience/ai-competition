import { getEmpireTerritories, getEmpireArmies, adjustConfidence, findTradeRoute, computeChokepointTolls } from './GameState.js';
import { BUILDING_DEFS, RUSSIA_SEGMENTS } from '../data/territories.js';
import { CongressEngine } from './CongressEngine.js';

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

        if (def.techRequired && !empire.techs?.completed?.includes(def.techRequired)) continue;
        if (def.requiresBuilding && !territory.buildings?.[def.requiresBuilding]) continue;

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
        const isMerc = !!action.mercenary;

        if (isMerc) {
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
            type: 'recruitment',
            description: `${empire.name} hired ${amount} mercenaries in ${territory.name}`,
            involvedEmpires: [empireId],
          });
        } else {
          const effectiveProd = territory.resources.industry + (territory.buildings?.factory ? 2 : 0);
          const maxRecruit = Math.floor(effectiveProd / 2);
          const amount = Math.min(action.amount || 0, maxRecruit);
          const goldCost = amount * 3;
          const weariness = Object.values(empire.warTurns || {}).reduce((s, v) => s + v, 0);
          const wearinessSurcharge = weariness >= 5 ? amount * 1 : 0;
          const totalCost = goldCost + wearinessSurcharge;

          if (amount <= 0) continue;
          if (empire.treasury < totalCost) continue;

          empire.treasury -= totalCost;

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
    }

    return events;
  }

  updateEconomy(state) {
    const events = [];

    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;

      const territories = getEmpireTerritories(state, empire.id);
      const armies = getEmpireArmies(state, empire.id);

      let capitalIncome = 0;
      let totalManpower = 0;
      territories.forEach(t => {
        let manpowerMod = 0;
        let capitalMod = 0;
        let gridDown = false;
        state.activeEvents.forEach(evt => {
          if (evt.affectedTerritoryId === t.id) {
            manpowerMod += evt.effect.manpower || 0;
            capitalMod += evt.effect.capital || 0;
            if (evt.effect.gridDown) gridDown = true;
          }
        });
        const buildingBonus = gridDown ? { trade: 0, housing: 0, factory: 0 } : {
          trade: t.buildings?.trade_office ? 2 : 0,
          housing: t.buildings?.housing ? 2 : 0,
          factory: t.buildings?.factory ? 2 : 0,
        };
        capitalIncome += t.resources.capital + capitalMod + buildingBonus.trade;
        totalManpower += t.resources.manpower + manpowerMod + buildingBonus.housing;
      });

      let tradeIncome = 0;
      for (const rel of Object.values(state.relations)) {
        if (rel.status === 'trade' || rel.status === 'alliance') {
          if (rel.empireA === empire.id || rel.empireB === empire.id) {
            const partnerId = rel.empireA === empire.id ? rel.empireB : rel.empireA;
            const route = findTradeRoute(state, empire.id, partnerId);
            if (route) {
              const { toll, tolledBy } = computeChokepointTolls(state, route, empire.id, partnerId);
              const netTrade = Math.max(0, rel.tradeValue - toll);
              tradeIncome += netTrade;
              for (const entry of tolledBy) {
                const tollEmpire = state.empires[entry.empireId];
                if (tollEmpire && !tollEmpire.isEliminated) {
                  tollEmpire.treasury += 1;
                  if (!tollEmpire._tollCollected) tollEmpire._tollCollected = 0;
                  tollEmpire._tollCollected += 1;
                }
              }
              if (toll > 0) {
                const names = tolledBy.map(e => `${e.chokepoint} (${state.empires[e.empireId]?.name || e.empireId})`).join(', ');
                events.push({
                  turn: state.meta.turn,
                  type: 'chokepoint_toll',
                  description: `${empire.name}'s trade with ${state.empires[partnerId]?.name || partnerId} is taxed ${toll} capital by chokepoint controllers: ${names}`,
                  involvedEmpires: [empire.id, partnerId, ...tolledBy.map(e => e.empireId)],
                });
              }
            } else if (rel.tradeValue > 0) {
              events.push({
                turn: state.meta.turn,
                type: 'trade_blocked',
                description: `Trade route between ${empire.name} and ${state.empires[partnerId]?.name || partnerId} is blocked by hostile territory or embargo!`,
                involvedEmpires: [empire.id, partnerId],
              });
            }
          }
        }
      }

      const congressEngine = new CongressEngine();
      if (congressEngine.isTradeStimulus(state)) {
        tradeIncome *= 2;
      }

      const regionBonus = this._checkRegionBonuses(state, empire.id, territories);
      capitalIncome += regionBonus.capital;
      totalManpower += regionBonus.manpower;
      if (regionBonus.event) {
        events.push(regionBonus.event);
      }

      const regularUnits = armies.filter(a => !a.isMercenary).reduce((s, a) => s + a.size, 0);
      const mercUnits = armies.filter(a => a.isMercenary).reduce((s, a) => s + a.size, 0);
      const armyUpkeep = Math.floor(regularUnits * 0.5) + (mercUnits * 1);

      empire.treasury += capitalIncome + tradeIncome - armyUpkeep;
      empire.treasury = Math.max(0, empire.treasury);

      const manpowerNeeded = regularUnits;
      const regularArmies = armies.filter(a => !a.isMercenary);
      if (totalManpower < manpowerNeeded && regularArmies.length > 0) {
        const deficit = manpowerNeeded - totalManpower;
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
          description: `${empire.name} suffers manpower shortage! Divisions lose strength.`,
          involvedEmpires: [empire.id],
        });
      }

      delete empire._tollCollected;

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

      if (!empire.warTurns) empire.warTurns = {};
      for (const rel of Object.values(state.relations)) {
        if (rel.status !== 'war') continue;
        const opponentId = rel.empireA === empire.id ? rel.empireB :
                           rel.empireB === empire.id ? rel.empireA : null;
        if (!opponentId) continue;
        empire.warTurns[opponentId] = (empire.warTurns[opponentId] || 0) + 1;
      }

      const totalWeariness = Object.values(empire.warTurns).reduce((s, v) => s + v, 0);

      if (totalWeariness >= 10) {
        adjustConfidence(empire, -1);
      }

      if (totalWeariness >= 15) {
        for (const t of territories) {
          if (t.capital) continue;
          if (Math.random() < 0.05) {
            t.ownerId = null;
            for (const [aid, army] of Object.entries(state.armies)) {
              if (army.locationId === t.id && army.empireId === empire.id) {
                delete state.armies[aid];
              }
            }
            events.push({
              turn: state.meta.turn,
              type: 'war_weariness_revolt',
              description: `${t.name} has revolted against ${empire.name} due to extreme war weariness!`,
              involvedEmpires: [empire.id],
            });
          }
        }
      }

      if (totalWeariness >= 5) {
        let penaltyDesc = '+1 recruitment cost';
        if (totalWeariness >= 10) penaltyDesc += ', -1 confidence/turn';
        if (totalWeariness >= 15) penaltyDesc += ', revolt risk';
        events.push({
          turn: state.meta.turn,
          type: 'war_weariness',
          description: `${empire.name} suffers war weariness (${totalWeariness} total turns at war). Penalties: ${penaltyDesc}`,
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

  _checkRegionBonuses(state, empireId, territories) {
    const result = { capital: 0, manpower: 0, event: null };
    const ownedIds = new Set(territories.map(t => t.id));

    const holdsAllRussia = RUSSIA_SEGMENTS.every(id => ownedIds.has(id));
    if (holdsAllRussia) {
      result.capital += 5;
      result.manpower += 3;
      result.event = {
        turn: state.meta.turn,
        type: 'region_bonus',
        description: `${state.empires[empireId].name} controls all of Russia — receiving bonus resources (+5 capital, +3 manpower)`,
        involvedEmpires: [empireId],
      };
    }

    return result;
  }
}
