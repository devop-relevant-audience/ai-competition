import { TECH_DEFS } from '../data/techs.js';
import { RESOURCE_DEFS, RESOURCE_IDS } from '../data/resources.js';
import { TERRITORY_DATA } from '../data/territories.js';
import { getEmpireTerritories } from './GameState.js';

export class ResearchEngine {
  processResearchActions(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        if (action.type !== 'research') continue;

        const techId = action.tech_id;
        const techDef = TECH_DEFS[techId];
        if (!techDef) continue;

        if (empire.techs.completed.includes(techId)) continue;
        if (empire.techs.inProgress[techId]) continue;

        if (techDef.prerequisite && !empire.techs.completed.includes(techDef.prerequisite)) continue;

        let labTerritoryId = action.lab_territory_id;
        if (!labTerritoryId) {
          labTerritoryId = this._findAvailableLab(state, empireId);
        }
        if (!labTerritoryId) continue;

        const labTerritory = state.territories[labTerritoryId];
        if (!labTerritory || labTerritory.ownerId !== empireId) continue;
        if (!labTerritory.buildings?.research_lab) continue;

        const labBusy = Object.values(empire.techs.inProgress).some(
          p => p.labTerritoryId === labTerritoryId
        );
        if (labBusy) continue;

        if (!this._canAfford(empire, techDef.cost)) continue;

        this._deductCost(empire, techDef.cost);

        let turns = techDef.researchTurns;
        const terrData = TERRITORY_DATA[labTerritoryId];
        if (terrData?.rareResource) {
          const costResources = Object.keys(techDef.cost).filter(k => k !== 'capital');
          if (costResources.includes(terrData.rareResource)) {
            turns = Math.max(1, turns - 1);
          }
        }

        empire.techs.inProgress[techId] = {
          startedTurn: state.meta.turn,
          completesTurn: state.meta.turn + turns,
          labTerritoryId,
        };

        events.push({
          turn: state.meta.turn,
          type: 'research_started',
          description: `${empire.name} began researching ${techDef.label} (completes turn ${state.meta.turn + turns})`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  updateResearch(state) {
    const events = [];

    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;
      if (!empire.techs) continue;

      const toComplete = [];
      const toCancel = [];

      for (const [techId, progress] of Object.entries(empire.techs.inProgress)) {
        const labTerritory = state.territories[progress.labTerritoryId];
        if (!labTerritory || labTerritory.ownerId !== empire.id) {
          toCancel.push(techId);
          continue;
        }
        if (progress.completesTurn <= state.meta.turn) {
          toComplete.push(techId);
        }
      }

      for (const techId of toComplete) {
        const techDef = TECH_DEFS[techId];
        delete empire.techs.inProgress[techId];
        empire.techs.completed.push(techId);
        events.push({
          turn: state.meta.turn,
          type: 'research_completed',
          description: `${empire.name} completed research: ${techDef?.label || techId}!`,
          involvedEmpires: [empire.id],
        });
      }

      for (const techId of toCancel) {
        const techDef = TECH_DEFS[techId];
        delete empire.techs.inProgress[techId];
        events.push({
          turn: state.meta.turn,
          type: 'research_cancelled',
          description: `${empire.name}'s research on ${techDef?.label || techId} was cancelled — lab territory lost!`,
          involvedEmpires: [empire.id],
        });
      }
    }

    return events;
  }

  updateResourceIncome(state) {
    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated) continue;
      if (!empire.resources) continue;

      for (const rid of RESOURCE_IDS) {
        empire.resources[rid].income = 0;
      }

      const territories = getEmpireTerritories(state, empire.id);
      let resourceCapitalBonus = 0;

      for (const terr of territories) {
        const terrData = TERRITORY_DATA[terr.id];
        if (terrData?.rareResource && RESOURCE_DEFS[terrData.rareResource]) {
          empire.resources[terrData.rareResource].income += 1;
          resourceCapitalBonus += RESOURCE_DEFS[terrData.rareResource].capitalBonus;
        }
      }

      for (const rid of RESOURCE_IDS) {
        empire.resources[rid].stockpile += empire.resources[rid].income;
      }

      empire.treasury += resourceCapitalBonus;
    }
  }

  canResearch(empire, techId) {
    const techDef = TECH_DEFS[techId];
    if (!techDef) return false;
    if (empire.techs.completed.includes(techId)) return false;
    if (empire.techs.inProgress[techId]) return false;
    if (techDef.prerequisite && !empire.techs.completed.includes(techDef.prerequisite)) return false;
    return this._canAfford(empire, techDef.cost);
  }

  hasCompletedTech(empire, techId) {
    return empire.techs.completed.includes(techId);
  }

  _findAvailableLab(state, empireId) {
    const empire = state.empires[empireId];
    const territories = getEmpireTerritories(state, empireId);
    for (const terr of territories) {
      if (!terr.buildings?.research_lab) continue;
      const labBusy = Object.values(empire.techs.inProgress).some(
        p => p.labTerritoryId === terr.id
      );
      if (!labBusy) return terr.id;
    }
    return null;
  }

  _canAfford(empire, cost) {
    if (empire.treasury < (cost.capital || 0)) return false;
    for (const [resource, amount] of Object.entries(cost)) {
      if (resource === 'capital') continue;
      if (!empire.resources?.[resource] || empire.resources[resource].stockpile < amount) return false;
    }
    return true;
  }

  _deductCost(empire, cost) {
    empire.treasury -= cost.capital || 0;
    for (const [resource, amount] of Object.entries(cost)) {
      if (resource === 'capital') continue;
      empire.resources[resource].stockpile -= amount;
    }
  }
}
