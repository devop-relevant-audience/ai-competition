import { ADJACENCY, TERRITORY_DATA } from '../data/territories.js';
import { getEmpireTerritories, adjustConfidence } from './GameState.js';

const UAV_COST = 4;
const UAV_DURATION = 2;
const SATELLITE_COST = { capital: 10, rare_earths: 3 };

export class IntelEngine {

  processUavRecon(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('aerial_recon')) continue;

      for (const action of actions) {
        if (action.type !== 'uav_recon') continue;

        const targetTid = action.target_territory_id;
        const target = state.territories[targetTid];
        if (!target) continue;

        if (empire.treasury < UAV_COST) continue;

        const already = empire.intel?.uavRecon?.some(
          r => r.territoryId === targetTid && r.expiresOnTurn > state.meta.turn
        );
        if (already) continue;

        empire.treasury -= UAV_COST;

        if (!empire.intel) empire.intel = { uavRecon: [], satellites: [] };
        empire.intel.uavRecon.push({
          territoryId: targetTid,
          expiresOnTurn: state.meta.turn + UAV_DURATION,
        });

        events.push({
          turn: state.meta.turn,
          type: 'uav_deployed',
          description: `${empire.name} deployed UAV recon over ${target.name}`,
          involvedEmpires: [empireId],
        });
      }
    }

    return events;
  }

  processLaunchSatellite(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;
      if (!empire.techs?.completed?.includes('space_supremacy')) continue;

      for (const action of actions) {
        if (action.type !== 'launch_satellite') continue;

        const territory = state.territories[action.territory_id];
        if (!territory || territory.ownerId !== empireId) continue;
        if (!territory.buildings?.space_command) continue;
        if (territory.satelliteLaunched) continue;

        if (empire.treasury < SATELLITE_COST.capital) continue;
        const reStock = empire.resources?.rare_earths?.stockpile || 0;
        if (reStock < SATELLITE_COST.rare_earths) continue;

        empire.treasury -= SATELLITE_COST.capital;
        empire.resources.rare_earths.stockpile -= SATELLITE_COST.rare_earths;
        territory.satelliteLaunched = true;

        const terrData = TERRITORY_DATA[action.territory_id];
        const region = terrData?.region;
        if (!region) continue;

        if (!empire.intel) empire.intel = { uavRecon: [], satellites: [] };
        if (!empire.intel.satellites.includes(region)) {
          empire.intel.satellites.push(region);
        }

        const regionLabel = region.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        events.push({
          turn: state.meta.turn,
          type: 'satellite_launched',
          description: `${empire.name} launched a surveillance satellite — ${regionLabel} region now under permanent observation`,
          involvedEmpires: [empireId],
        });

        adjustConfidence(empire, 5);
      }
    }

    return events;
  }

  expireIntel(state) {
    for (const empire of Object.values(state.empires)) {
      if (empire.isEliminated || !empire.intel) continue;
      empire.intel.uavRecon = empire.intel.uavRecon.filter(
        r => r.expiresOnTurn > state.meta.turn
      );
    }
  }

  computeVisibility(state, empireId) {
    const empire = state.empires[empireId];
    const myTerritories = new Set(
      getEmpireTerritories(state, empireId).map(t => t.id)
    );

    const adjacent = new Set();
    for (const tid of myTerritories) {
      for (const neighbor of (ADJACENCY[tid] || [])) {
        if (!myTerritories.has(neighbor)) adjacent.add(neighbor);
      }
    }

    const radar = new Set();
    for (const tid of myTerritories) {
      const terr = state.territories[tid];
      if (!terr?.buildings?.radar_station) continue;
      for (const hop1 of (ADJACENCY[tid] || [])) {
        if (myTerritories.has(hop1)) continue;
        for (const hop2 of (ADJACENCY[hop1] || [])) {
          if (!myTerritories.has(hop2) && !adjacent.has(hop2)) {
            radar.add(hop2);
          }
        }
      }
    }

    const uav = new Set();
    if (empire.intel?.uavRecon) {
      for (const entry of empire.intel.uavRecon) {
        if (entry.expiresOnTurn > state.meta.turn && !myTerritories.has(entry.territoryId)) {
          uav.add(entry.territoryId);
        }
      }
    }

    const satellite = new Set();
    if (empire.intel?.satellites) {
      for (const region of empire.intel.satellites) {
        for (const [tid, data] of Object.entries(TERRITORY_DATA)) {
          if (data.region === region && !myTerritories.has(tid) && state.territories[tid]) {
            satellite.add(tid);
          }
        }
      }
    }

    return { adjacent, radar, uav, satellite };
  }
}
