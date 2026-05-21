import { TERRITORY_DATA } from '../data/territories.js';
import { EMPIRE_DEFINITIONS } from '../data/empires.js';

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16));
}

export function createInitialState(config = {}) {
  const turnLimit = config.turnLimit || 50;
  const activeRegions = config.regions || ['europe'];

  const activeEmpireDefs = EMPIRE_DEFINITIONS.filter(def => activeRegions.includes(def.region));
  const activeTerritoryEntries = Object.entries(TERRITORY_DATA).filter(([, data]) => activeRegions.includes(data.region));

  const empires = {};
  activeEmpireDefs.forEach(def => {
    empires[def.id] = {
      id: def.id,
      name: def.name,
      model: def.model,
      personality: def.personality,
      personalityDescription: def.personalityDescription,
      color: def.color,
      colorLight: def.colorLight,
      treasury: 20,
      reputation: 50,
      confidence: 50,
      isEliminated: false,
    };
  });

  const territories = {};
  const empireStarting = {};
  activeEmpireDefs.forEach(def => {
    empireStarting[def.id] = new Set(def.startingTerritories);
  });

  for (const [tid, data] of activeTerritoryEntries) {
    let ownerId = null;
    for (const [empId, starts] of Object.entries(empireStarting)) {
      if (starts.has(tid)) { ownerId = empId; break; }
    }

    territories[tid] = {
      id: tid,
      name: data.name,
      ownerId,
      capital: false,
      resources: { ...data.resources },
      terrain: data.terrain,
      buildings: {},
    };
  }

  activeEmpireDefs.forEach(def => {
    if (def.startingTerritories.length > 0 && territories[def.startingTerritories[0]]) {
      territories[def.startingTerritories[0]].capital = true;
    }
  });

  const armies = {};
  activeEmpireDefs.forEach(def => {
    def.startingTerritories.forEach((tid, i) => {
      if (!territories[tid]) return;
      const armyId = `army_${def.id}_${i}`;
      const size = i === 0 ? 3 : 1;
      armies[armyId] = {
        id: armyId,
        empireId: def.id,
        locationId: tid,
        size,
        movesRemaining: 1,
        isMercenary: false,
      };
    });
  });

  const ownedTerritoryIds = new Set();
  activeEmpireDefs.forEach(def => {
    def.startingTerritories.forEach(tid => ownedTerritoryIds.add(tid));
  });
  for (const [tid] of activeTerritoryEntries) {
    if (!ownedTerritoryIds.has(tid)) {
      const armyId = `army_neutral_${tid}`;
      armies[armyId] = {
        id: armyId,
        empireId: 'neutral',
        locationId: tid,
        size: 1,
        movesRemaining: 0,
      };
    }
  }

  const relations = {};
  const empireIds = activeEmpireDefs.map(d => d.id);
  for (let i = 0; i < empireIds.length; i++) {
    for (let j = i + 1; j < empireIds.length; j++) {
      const key = getRelationKey(empireIds[i], empireIds[j]);
      const sorted = empireIds[i] < empireIds[j]
        ? [empireIds[i], empireIds[j]]
        : [empireIds[j], empireIds[i]];
      relations[key] = {
        empireA: sorted[0],
        empireB: sorted[1],
        status: 'neutral',
        pactExpiry: null,
        tradeValue: 0,
        peaceCooldownUntil: null,
      };
    }
  }

  return {
    meta: {
      gameId: uuid(),
      turn: 1,
      turnLimit,
      phase: 'awaiting_advance',
      speed: 'normal',
      regions: activeRegions,
      presetKey: config.presetKey || null,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    },
    empires,
    territories,
    armies,
    relations,
    diplomacyQueue: [],
    pendingActions: {},
    turnHistory: [],
    eventLog: [],
    activeEvents: [],
  };
}

export function getRelationKey(empireA, empireB) {
  return empireA < empireB
    ? `${empireA}__${empireB}`
    : `${empireB}__${empireA}`;
}

export function getRelation(state, empireA, empireB) {
  const key = getRelationKey(empireA, empireB);
  return state.relations[key] || null;
}

export function getEmpireTerritories(state, empireId) {
  return Object.values(state.territories).filter(t => t.ownerId === empireId);
}

export function getEmpireArmies(state, empireId) {
  return Object.values(state.armies).filter(a => a.empireId === empireId);
}

export function getTotalTerritories(state) {
  if (state) return Object.keys(state.territories).length;
  return Object.keys(TERRITORY_DATA).length;
}

export function adjustConfidence(empire, delta) {
  empire.confidence = Math.min(100, Math.max(0, empire.confidence + delta));
}
