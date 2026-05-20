import { adjustConfidence } from './GameState.js';

const EVENT_TEMPLATES = [
  {
    type: 'famine',
    name: 'Famine',
    description: 'A terrible famine strikes {territory}!',
    effect: { food: -2 },
    duration: 2,
    weight: (territory) => territory.resources.food <= 2 ? 2 : 1,
    targetType: 'owned_territory',
  },
  {
    type: 'plague',
    name: 'Plague',
    description: 'Plague ravages armies in {territory}!',
    instantEffect: (state, territoryId) => {
      const armies = Object.values(state.armies).filter(a => a.locationId === territoryId);
      armies.forEach(a => { a.size = Math.max(1, a.size - 2); });
    },
    duration: 0,
    weight: () => 1,
    targetType: 'territory_with_army',
  },
  {
    type: 'gold_rush',
    name: 'Gold Rush',
    description: 'A gold rush in {territory} fills the coffers!',
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
    type: 'rebellion',
    name: 'Rebellion',
    description: 'A rebellion erupts in {territory}! The territory breaks free!',
    instantEffect: (state, territoryId) => {
      state.territories[territoryId].ownerId = null;
      state.territories[territoryId].capital = false;
    },
    duration: 0,
    weight: () => 0.5,
    targetType: 'owned_territory',
  },
  {
    type: 'storm',
    name: 'Great Storm',
    description: 'A devastating storm batters the coasts!',
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
    type: 'bountiful_harvest',
    name: 'Bountiful Harvest',
    description: 'A bountiful harvest blesses {territory}!',
    effect: { food: 2 },
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
    const territoryName = target ? state.territories[target]?.name || target : 'Europe';
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

    const POSITIVE_EVENTS = ['gold_rush', 'bountiful_harvest'];
    const NEGATIVE_EVENTS = ['famine', 'plague', 'rebellion', 'storm'];
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
      const w = t.targetType === 'global' ? t.weight() : t.weight({ resources: { food: 3 } });
      return sum + w;
    }, 0);

    let roll = Math.random() * totalWeight;
    for (const template of EVENT_TEMPLATES) {
      const w = template.targetType === 'global' ? template.weight() : template.weight({ resources: { food: 3 } });
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
