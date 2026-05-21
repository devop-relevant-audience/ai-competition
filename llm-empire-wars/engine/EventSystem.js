import { adjustConfidence } from './GameState.js';

const EVENT_TEMPLATES = [
  {
    type: 'labor_strike',
    name: 'Labor Strike',
    description: 'A general strike cripples workforce output in {territory}!',
    effect: { manpower: -2 },
    duration: 2,
    weight: (territory) => territory.resources.manpower <= 2 ? 2 : 1,
    targetType: 'owned_territory',
  },
  {
    type: 'epidemic',
    name: 'Epidemic',
    description: 'A disease outbreak decimates military personnel in {territory}!',
    instantEffect: (state, territoryId) => {
      const armies = Object.values(state.armies).filter(a => a.locationId === territoryId);
      armies.forEach(a => { a.size = Math.max(1, a.size - 2); });
    },
    duration: 0,
    weight: () => 1,
    targetType: 'territory_with_army',
  },
  {
    type: 'foreign_investment',
    name: 'Foreign Investment',
    description: 'Foreign capital floods into {territory}!',
    instantEffect: (state, territoryId) => {
      const territory = state.territories[territoryId];
      if (territory && territory.ownerId) {
        state.empires[territory.ownerId].treasury += 5;
      }
    },
    duration: 0,
    weight: () => 1,
    targetType: 'owned_territory',
  },
  {
    type: 'coup',
    name: 'Military Coup',
    description: 'A military coup destabilizes {territory}! The region declares independence!',
    instantEffect: (state, territoryId) => {
      state.territories[territoryId].ownerId = null;
      state.territories[territoryId].capital = false;
    },
    duration: 0,
    weight: () => 0.5,
    targetType: 'owned_territory',
  },
  {
    type: 'infrastructure_collapse',
    name: 'Infrastructure Collapse',
    description: 'Critical infrastructure fails across coastal regions!',
    instantEffect: (state) => {
      const coastalArmies = Object.values(state.armies).filter(a => {
        const t = state.territories[a.locationId];
        return t && t.terrain === 'coast';
      });
      coastalArmies.forEach(a => { a.size = Math.max(1, a.size - 1); });
    },
    duration: 0,
    weight: () => 0.6,
    targetType: 'global',
  },
  {
    type: 'population_boom',
    name: 'Population Boom',
    description: 'A population boom surges through {territory}!',
    effect: { manpower: 2 },
    duration: 2,
    weight: (territory) => territory.terrain === 'plains' ? 2 : 0.5,
    targetType: 'owned_territory',
  },
];

export class EventSystem {
  rollEvents(state) {
    const events = [];

    this._expireEvents(state);

    if (Math.random() > 0.2) return events;

    const template = this._pickTemplate(state);
    if (!template) return events;

    const target = this._pickTarget(state, template);
    const territoryName = target ? state.territories[target]?.name || target : 'the known world';
    const description = template.description.replace('{territory}', territoryName);

    if (template.instantEffect) {
      template.instantEffect(state, target);
    }

    if (template.duration > 0 && target) {
      const activeEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: template.type,
        name: template.name,
        affectedTerritoryId: target,
        effect: { ...template.effect },
        expiresOnTurn: state.meta.turn + template.duration,
      };
      state.activeEvents.push(activeEvent);
    }

    const involvedEmpires = target && state.territories[target]?.ownerId
      ? [state.territories[target].ownerId]
      : [];

    const POSITIVE_EVENTS = ['foreign_investment', 'population_boom'];
    const NEGATIVE_EVENTS = ['labor_strike', 'epidemic', 'coup', 'infrastructure_collapse'];
    if (involvedEmpires.length > 0) {
      const empire = state.empires[involvedEmpires[0]];
      if (empire) {
        if (POSITIVE_EVENTS.includes(template.type)) adjustConfidence(empire, 2);
        else if (NEGATIVE_EVENTS.includes(template.type)) adjustConfidence(empire, -2);
      }
    }

    events.push({
      turn: state.meta.turn,
      type: 'world_event',
      description: `[${template.name}] ${description}`,
      involvedEmpires,
    });

    return events;
  }

  _expireEvents(state) {
    state.activeEvents = state.activeEvents.filter(e => e.expiresOnTurn > state.meta.turn);
  }

  _pickTemplate(state) {
    const totalWeight = EVENT_TEMPLATES.reduce((sum, t) => {
      const w = t.targetType === 'global' ? t.weight() : t.weight({ resources: { manpower: 3 }, terrain: 'plains' });
      return sum + w;
    }, 0);

    let roll = Math.random() * totalWeight;
    for (const template of EVENT_TEMPLATES) {
      const w = template.targetType === 'global' ? template.weight() : template.weight({ resources: { manpower: 3 }, terrain: 'plains' });
      roll -= w;
      if (roll <= 0) return template;
    }
    return EVENT_TEMPLATES[0];
  }

  _pickTarget(state, template) {
    const owned = Object.values(state.territories).filter(t => t.ownerId);
    const withArmies = Object.values(state.territories).filter(t =>
      Object.values(state.armies).some(a => a.locationId === t.id)
    );

    let pool;
    switch (template.targetType) {
      case 'owned_territory': pool = owned; break;
      case 'territory_with_army': pool = withArmies.length > 0 ? withArmies : owned; break;
      case 'global': return null;
      default: pool = owned;
    }

    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
}
