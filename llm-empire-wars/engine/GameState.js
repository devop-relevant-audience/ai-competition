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

  const empires = {};
  EMPIRE_DEFINITIONS.forEach(def => {
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
      isEliminated: false,
    };
  });

  const territories = {};
  const empireStarting = {};
  EMPIRE_DEFINITIONS.forEach(def => {
    empireStarting[def.id] = new Set(def.startingTerritories);
  });

  for (const [tid, data] of Object.entries(TERRITORY_DATA)) {
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
    };
  }

  EMPIRE_DEFINITIONS.forEach(def => {
    if (def.startingTerritories.length > 0) {
      territories[def.startingTerritories[0]].capital = true;
    }
  });

  const armies = {};
  EMPIRE_DEFINITIONS.forEach(def => {
    def.startingTerritories.forEach((tid, i) => {
      const armyId = `army_${def.id}_${i}`;
      const size = i === 0 ? Math.ceil(def.startingArmySize / 2) : Math.floor(def.startingArmySize / (def.startingTerritories.length - 1 || 1));
      armies[armyId] = {
        id: armyId,
        empireId: def.id,
        locationId: tid,
        size: Math.max(size, 2),
        movesRemaining: 1,
      };
    });
  });

  const relations = {};
  const empireIds = EMPIRE_DEFINITIONS.map(d => d.id);
  for (let i = 0; i < empireIds.length; i++) {
    for (let j = i + 1; j < empireIds.length; j++) {
      const key = `${empireIds[i]}__${empireIds[j]}`;
      relations[key] = {
        empireA: empireIds[i],
        empireB: empireIds[j],
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

export function getTotalTerritories() {
  return Object.keys(TERRITORY_DATA).length;
}
