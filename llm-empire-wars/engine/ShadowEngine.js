import { getEmpireTerritories } from './GameState.js';

const FUND_INSURGENCY_COST = 8;
const HACK_GRID_COST = 6;
const SABOTAGE_COST = 8;
const GRID_DOWN_DURATION = 2;

export class ShadowEngine {
  processFundInsurgency(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('covert_operations')) continue;

      for (const action of actions) {
        if (action.type !== 'fund_insurgency') continue;

        const targetTid = action.target_territory_id;
        const target = state.territories[targetTid];
        if (!target || !target.ownerId || target.ownerId === empireId) continue;

        if (empire.treasury < FUND_INSURGENCY_COST) continue;

        empire.treasury -= FUND_INSURGENCY_COST;

        const armyId = `army_neutral_insurgent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        state.armies[armyId] = {
          id: armyId,
          empireId: 'neutral',
          locationId: targetTid,
          size: 2,
          movesRemaining: 0,
        };

        const victimId = target.ownerId;
        const hasCounterIntel = target.buildings?.cyber_center;
        const detectionChance = hasCounterIntel ? 0.7 : 0.3;
        const detected = Math.random() < detectionChance;

        if (detected) {
          events.push({
            turn: state.meta.turn,
            type: 'insurgency_detected',
            description: `An insurgency erupted in ${target.name} — intelligence traced the funding to ${empire.name}!`,
            involvedEmpires: [empireId, victimId],
          });
        } else {
          events.push({
            turn: state.meta.turn,
            type: 'insurgency',
            description: `An insurgency has erupted in ${target.name}!`,
            involvedEmpires: [victimId],
          });
        }

        events.push({
          turn: state.meta.turn,
          type: 'shadow_op_executed',
          description: `${empire.name} funded insurgency in ${target.name}${detected ? ' (detected!)' : ' (undetected)'}`,
          involvedEmpires: [empireId],
          _private: true,
        });
      }
    }

    return events;
  }

  processHackGrid(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('cyber_warfare')) continue;

      const hasCyberCenter = getEmpireTerritories(state, empireId)
        .some(t => t.buildings?.cyber_center);
      if (!hasCyberCenter) continue;

      for (const action of actions) {
        if (action.type !== 'hack_grid') continue;

        const targetTid = action.target_territory_id;
        const target = state.territories[targetTid];
        if (!target || !target.ownerId || target.ownerId === empireId) continue;

        if (empire.treasury < HACK_GRID_COST) continue;

        empire.treasury -= HACK_GRID_COST;

        state.activeEvents.push({
          name: 'Grid Down',
          affectedTerritoryId: targetTid,
          expiresOnTurn: state.meta.turn + GRID_DOWN_DURATION,
          effect: { gridDown: true },
        });

        const victimId = target.ownerId;
        const hasCounterIntel = target.buildings?.cyber_center;
        const detectionChance = hasCounterIntel ? 0.7 : 0.4;
        const detected = Math.random() < detectionChance;

        if (detected) {
          events.push({
            turn: state.meta.turn,
            type: 'hack_detected',
            description: `${target.name}'s power grid was hacked! Cyber analysts traced the attack to ${empire.name}.`,
            involvedEmpires: [empireId, victimId],
          });
        } else {
          events.push({
            turn: state.meta.turn,
            type: 'hack_grid',
            description: `${target.name}'s power grid was hacked! All building bonuses disabled for ${GRID_DOWN_DURATION} turns.`,
            involvedEmpires: [victimId],
          });
        }

        events.push({
          turn: state.meta.turn,
          type: 'shadow_op_executed',
          description: `${empire.name} hacked the grid in ${target.name}${detected ? ' (detected!)' : ' (undetected)'}`,
          involvedEmpires: [empireId],
          _private: true,
        });
      }
    }

    return events;
  }

  processSabotage(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('cyber_warfare')) continue;

      const hasCyberCenter = getEmpireTerritories(state, empireId)
        .some(t => t.buildings?.cyber_center);
      if (!hasCyberCenter) continue;

      for (const action of actions) {
        if (action.type !== 'sabotage') continue;

        const targetTid = action.target_territory_id;
        const target = state.territories[targetTid];
        if (!target || !target.ownerId || target.ownerId === empireId) continue;

        const existingBuildings = Object.keys(target.buildings || {}).filter(b => target.buildings[b]);
        if (existingBuildings.length === 0) continue;

        if (empire.treasury < SABOTAGE_COST) continue;

        empire.treasury -= SABOTAGE_COST;

        const destroyedBuilding = existingBuildings[Math.floor(Math.random() * existingBuildings.length)];
        target.buildings[destroyedBuilding] = false;

        const victimId = target.ownerId;
        const hasCounterIntel = target.buildings?.cyber_center;
        const detectionChance = hasCounterIntel ? 0.8 : 0.5;
        const detected = Math.random() < detectionChance;

        const buildingLabel = destroyedBuilding.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        if (detected) {
          events.push({
            turn: state.meta.turn,
            type: 'sabotage_detected',
            description: `${buildingLabel} in ${target.name} was destroyed by sabotage! Evidence points to ${empire.name}.`,
            involvedEmpires: [empireId, victimId],
          });
        } else {
          events.push({
            turn: state.meta.turn,
            type: 'sabotage',
            description: `${buildingLabel} in ${target.name} was destroyed by an unknown saboteur!`,
            involvedEmpires: [victimId],
          });
        }

        events.push({
          turn: state.meta.turn,
          type: 'shadow_op_executed',
          description: `${empire.name} sabotaged ${buildingLabel} in ${target.name}${detected ? ' (detected!)' : ' (undetected)'}`,
          involvedEmpires: [empireId],
          _private: true,
        });
      }
    }

    return events;
  }
}
