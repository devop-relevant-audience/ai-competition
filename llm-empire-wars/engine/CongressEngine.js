import { getEmpireTerritories, getRelationKey } from './GameState.js';

const RESOLUTION_TEMPLATES = [
  {
    type: 'arms_limitation',
    label: 'Arms Limitation Treaty',
    description: 'All empires lose 20% of army units',
    getEffect: () => ({ type: 'arms_limitation' }),
  },
  {
    type: 'trade_stimulus',
    label: 'Global Trade Stimulus',
    description: 'All trade income doubled for 5 turns',
    getEffect: (state) => ({ type: 'trade_stimulus', duration: 5 }),
  },
  {
    type: 'global_sanctions',
    label: 'Global Sanctions',
    description: 'Target empire loses 3 capital/turn for 5 turns',
    getEffect: (state) => {
      const ranked = Object.values(state.empires)
        .filter(e => !e.isEliminated)
        .map(e => ({ id: e.id, count: getEmpireTerritories(state, e.id).length }))
        .sort((a, b) => b.count - a.count);
      const top2 = ranked.slice(0, 2);
      const target = top2[Math.floor(Math.random() * top2.length)];
      return { type: 'global_sanctions', targetEmpireId: target.id, penalty: 3, duration: 5 };
    },
  },
  {
    type: 'ceasefire_mandate',
    label: 'Ceasefire Mandate',
    description: 'All current wars get a 3-turn forced peace cooldown',
    getEffect: () => ({ type: 'ceasefire_mandate', cooldownTurns: 3 }),
  },
  {
    type: 'resource_sharing',
    label: 'Resource Sharing Agreement',
    description: 'All empires gain +3 of each rare resource to stockpile',
    getEffect: () => ({ type: 'resource_sharing', amount: 3 }),
  },
];

export class CongressEngine {
  shouldConvene(state) {
    if (!state.congress) return false;
    return state.meta.turn >= state.congress.nextCongressTurn;
  }

  generateResolution(state) {
    const template = RESOLUTION_TEMPLATES[Math.floor(Math.random() * RESOLUTION_TEMPLATES.length)];
    const effect = template.getEffect(state);
    const id = `resolution_${state.meta.turn}_${template.type}`;

    let description = template.description;
    if (effect.targetEmpireId) {
      const targetName = state.empires[effect.targetEmpireId]?.name || effect.targetEmpireId;
      description = `${targetName} loses ${effect.penalty} capital/turn for ${effect.duration} turns`;
    }

    return {
      id,
      type: template.type,
      label: template.label,
      description,
      effect,
    };
  }

  applyResolution(state, resolution, votes) {
    if (!state.congress) return [];

    const events = [];
    const empires = Object.values(state.empires).filter(e => !e.isEliminated);

    let yesCount = 0;
    let noCount = 0;
    const voteDetails = [];

    for (const empire of empires) {
      const v = votes[empire.id];
      if (v && v.vote === 'yes') {
        yesCount++;
        voteDetails.push(`${empire.name}: YES`);
      } else {
        noCount++;
        voteDetails.push(`${empire.name}: NO`);
      }
    }

    const passed = yesCount > noCount;
    const voteStr = `(${yesCount} yes, ${noCount} no)`;

    if (passed) {
      this._applyEffect(state, resolution.effect, empires);

      if (resolution.effect.duration) {
        state.congress.activeResolutions.push({
          ...resolution,
          expiresOnTurn: state.meta.turn + resolution.effect.duration,
          votes: voteDetails,
        });
      }

      events.push({
        turn: state.meta.turn,
        type: 'congress_resolution_passed',
        description: `World Congress PASSED: "${resolution.label}" — ${resolution.description} ${voteStr}`,
        involvedEmpires: empires.map(e => e.id),
      });
    } else {
      events.push({
        turn: state.meta.turn,
        type: 'congress_resolution_failed',
        description: `World Congress REJECTED: "${resolution.label}" — ${resolution.description} ${voteStr}`,
        involvedEmpires: empires.map(e => e.id),
      });
    }

    state.congress.history.push({
      turn: state.meta.turn,
      resolution,
      passed,
      votes: voteDetails,
    });

    state.congress.nextCongressTurn = state.meta.turn + state.congress.interval;

    events.unshift({
      turn: state.meta.turn,
      type: 'congress_convened',
      description: `World Congress convened on turn ${state.meta.turn}! Resolution proposed: "${resolution.label}"`,
      involvedEmpires: empires.map(e => e.id),
    });

    return events;
  }

  _applyEffect(state, effect, empires) {
    switch (effect.type) {
      case 'arms_limitation':
        for (const army of Object.values(state.armies)) {
          if (army.empireId === 'neutral') continue;
          const reduction = Math.floor(army.size * 0.2);
          army.size = Math.max(1, army.size - reduction);
        }
        break;

      case 'trade_stimulus':
        break;

      case 'global_sanctions':
        break;

      case 'ceasefire_mandate':
        for (const rel of Object.values(state.relations)) {
          if (rel.status === 'war') {
            rel.status = 'neutral';
            rel.tradeValue = 0;
            rel.peaceCooldownUntil = state.meta.turn + effect.cooldownTurns;
          }
        }
        for (const empire of empires) {
          if (empire.warTurns) {
            for (const key of Object.keys(empire.warTurns)) {
              empire.warTurns[key] = 0;
            }
          }
        }
        break;

      case 'resource_sharing':
        for (const empire of empires) {
          if (!empire.resources) continue;
          for (const [rid, res] of Object.entries(empire.resources)) {
            res.stockpile += effect.amount;
          }
        }
        break;
    }
  }

  applyOngoingResolutions(state) {
    if (!state.congress?.activeResolutions) return;

    for (const res of state.congress.activeResolutions) {
      if (res.effect.type === 'global_sanctions' && res.effect.targetEmpireId) {
        const target = state.empires[res.effect.targetEmpireId];
        if (target && !target.isEliminated) {
          target.treasury = Math.max(0, target.treasury - res.effect.penalty);
        }
      }
    }
  }

  isTradeStimulus(state) {
    if (!state.congress?.activeResolutions) return false;
    return state.congress.activeResolutions.some(r => r.effect.type === 'trade_stimulus');
  }

  expireResolutions(state) {
    if (!state.congress?.activeResolutions) return;
    state.congress.activeResolutions = state.congress.activeResolutions.filter(
      r => r.expiresOnTurn > state.meta.turn
    );
  }
}
