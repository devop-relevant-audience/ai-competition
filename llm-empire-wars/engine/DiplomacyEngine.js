import { getRelationKey, adjustConfidence } from './GameState.js';

export class DiplomacyEngine {
  processDiplomaticActions(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      for (const action of actions) {
        if (action._resolved) continue;
        switch (action.type) {
          case 'declare_war':
            events.push(...this._declareWar(state, empireId, action));
            break;
          case 'propose_peace':
            events.push(...this._resolveProposal(state, empireId, action, 'peace'));
            break;
          case 'propose_trade':
            events.push(...this._resolveProposal(state, empireId, action, 'trade'));
            break;
          case 'propose_alliance':
            events.push(...this._resolveProposal(state, empireId, action, 'alliance'));
            break;
          case 'break_alliance':
            events.push(...this._breakAlliance(state, empireId, action));
            break;
          case 'send_message':
            events.push(...this._sendMessage(state, empireId, action));
            break;
          case 'impose_embargo':
            events.push(...this._imposeEmbargo(state, empireId, action));
            break;
          case 'lift_embargo':
            events.push(...this._liftEmbargo(state, empireId, action));
            break;
        }
      }
    }

    return events;
  }

  updateReputations(state) {
    // Placeholder — reputation was removed; confidence handles morale.
  }

  _resolveProposal(state, empireId, action, proposalKind) {
    const events = [];
    const targetId = action.target_empire_id;
    const fromEmpire = state.empires[empireId];
    const toEmpire = state.empires[targetId];
    if (!fromEmpire || !toEmpire) return events;

    const key = getRelationKey(empireId, targetId);
    const rel = state.relations[key];
    if (!rel) return events;

    const status = action._accepted ? 'accepted' : 'rejected';
    const msg = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromEmpireId: empireId,
      toEmpireId: targetId,
      type: action.type,
      message: action._decisionReason || `${fromEmpire.name} proposed ${proposalKind} — ${status}`,
      turn: state.meta.turn,
      status,
    };
    state.diplomacyQueue.push(msg);

    if (action._accepted) {
      if (proposalKind === 'trade' && rel.status === 'neutral') {
        rel.status = 'trade';
        rel.tradeValue = 2;
        rel.embargo = null;
        adjustConfidence(fromEmpire, 2);
        adjustConfidence(toEmpire, 2);
        events.push(this._makeEvent(state, 'trade_established',
          `${toEmpire.name} accepted ${fromEmpire.name}'s trade proposal!`,
          [empireId, targetId]));
      } else if (proposalKind === 'alliance' && (rel.status === 'trade' || rel.status === 'neutral')) {
        rel.status = 'alliance';
        rel.embargo = null;
        adjustConfidence(fromEmpire, 4);
        adjustConfidence(toEmpire, 4);
        events.push(this._makeEvent(state, 'alliance_formed',
          `${toEmpire.name} accepted ${fromEmpire.name}'s alliance proposal!`,
          [empireId, targetId]));
        events.push(...this._inheritWars(state, empireId, targetId));
      } else if (proposalKind === 'peace' && rel.status === 'war') {
        rel.status = 'neutral';
        rel.embargo = null;
        rel.peaceCooldownUntil = state.meta.turn + 3;
        adjustConfidence(fromEmpire, 2);
        adjustConfidence(toEmpire, 2);
        events.push(this._makeEvent(state, 'peace_declared',
          `${toEmpire.name} accepted ${fromEmpire.name}'s peace proposal!`,
          [empireId, targetId]));
      } else {
        events.push(this._makeEvent(state, action.type,
          `${fromEmpire.name} proposed ${proposalKind} to ${toEmpire.name} (already in effect or invalid)`,
          [empireId, targetId]));
      }
    } else {
      adjustConfidence(fromEmpire, -2);
      events.push(this._makeEvent(state, 'proposal_rejected',
        `${toEmpire.name} rejected ${fromEmpire.name}'s ${proposalKind} proposal`,
        [empireId, targetId]));
    }

    return events;
  }

  _declareWar(state, empireId, action) {
    const events = [];
    const targetId = action.target_empire_id;
    const key = getRelationKey(empireId, targetId);
    const rel = state.relations[key];
    if (!rel || rel.status === 'war') return events;

    if (rel.peaceCooldownUntil && state.meta.turn < rel.peaceCooldownUntil) {
      return events;
    }

    const wasAllied = rel.status === 'alliance';
    const wasTrade = rel.status === 'trade';

    rel.status = 'war';
    rel.tradeValue = 0;
    rel.pactExpiry = null;
    rel.embargo = null;

    if (wasAllied) {
      adjustConfidence(state.empires[targetId], -8);
      adjustConfidence(state.empires[empireId], -5);
      events.push(this._makeEvent(state, 'betrayal',
        `${state.empires[empireId].name} BETRAYED their alliance with ${state.empires[targetId].name}!`,
        [empireId, targetId]));
    } else if (wasTrade) {
      adjustConfidence(state.empires[empireId], -2);
    }

    adjustConfidence(state.empires[empireId], 2);
    adjustConfidence(state.empires[targetId], -3);

    events.push(this._makeEvent(state, 'war_declared',
      `${state.empires[empireId].name} declared WAR on ${state.empires[targetId].name}!`,
      [empireId, targetId]));

    events.push(...this._callAlliesToWar(state, empireId, targetId));

    return events;
  }

  _inheritWars(state, empireA, empireB) {
    const events = [];

    const getWars = (eId) => {
      const enemies = [];
      for (const rel of Object.values(state.relations)) {
        if (rel.status !== 'war') continue;
        if (rel.empireA === eId) enemies.push(rel.empireB);
        else if (rel.empireB === eId) enemies.push(rel.empireA);
      }
      return enemies;
    };

    for (const enemyId of getWars(empireA)) {
      if (enemyId === empireB) continue;
      const key = getRelationKey(empireB, enemyId);
      const rel = state.relations[key];
      if (!rel || rel.status === 'war') continue;
      rel.status = 'war';
      rel.tradeValue = 0;
      rel.pactExpiry = null;
      events.push(this._makeEvent(state, 'war_declared',
        `${state.empires[empireB].name} enters war against ${state.empires[enemyId].name} — allied with ${state.empires[empireA].name}!`,
        [empireB, enemyId, empireA]));
    }

    for (const enemyId of getWars(empireB)) {
      if (enemyId === empireA) continue;
      const key = getRelationKey(empireA, enemyId);
      const rel = state.relations[key];
      if (!rel || rel.status === 'war') continue;
      rel.status = 'war';
      rel.tradeValue = 0;
      rel.pactExpiry = null;
      events.push(this._makeEvent(state, 'war_declared',
        `${state.empires[empireA].name} enters war against ${state.empires[enemyId].name} — allied with ${state.empires[empireB].name}!`,
        [empireA, enemyId, empireB]));
    }

    return events;
  }

  _callAlliesToWar(state, aggressorId, targetId) {
    const events = [];

    const alliesOf = (eId) => {
      const allies = [];
      for (const rel of Object.values(state.relations)) {
        if (rel.status !== 'alliance') continue;
        if (rel.empireA === eId) allies.push(rel.empireB);
        else if (rel.empireB === eId) allies.push(rel.empireA);
      }
      return allies;
    };

    for (const allyId of alliesOf(targetId)) {
      if (allyId === aggressorId) continue;
      const allyKey = getRelationKey(aggressorId, allyId);
      const allyRel = state.relations[allyKey];
      if (!allyRel || allyRel.status === 'war') continue;

      allyRel.status = 'war';
      allyRel.tradeValue = 0;
      allyRel.pactExpiry = null;

      events.push(this._makeEvent(state, 'war_declared',
        `${state.empires[allyId].name} joined the war against ${state.empires[aggressorId].name} in defense of their ally ${state.empires[targetId].name}!`,
        [allyId, aggressorId, targetId]));
    }

    for (const allyId of alliesOf(aggressorId)) {
      if (allyId === targetId) continue;
      const allyKey = getRelationKey(targetId, allyId);
      const allyRel = state.relations[allyKey];
      if (!allyRel || allyRel.status === 'war') continue;

      allyRel.status = 'war';
      allyRel.tradeValue = 0;
      allyRel.pactExpiry = null;

      events.push(this._makeEvent(state, 'war_declared',
        `${state.empires[allyId].name} joined the war against ${state.empires[targetId].name} in support of their ally ${state.empires[aggressorId].name}!`,
        [allyId, targetId, aggressorId]));
    }

    return events;
  }

  _imposeEmbargo(state, empireId, action) {
    const events = [];
    const targetId = action.target_empire_id;
    const fromEmpire = state.empires[empireId];
    const toEmpire = state.empires[targetId];
    if (!fromEmpire || !toEmpire) return events;

    const key = getRelationKey(empireId, targetId);
    const rel = state.relations[key];
    if (!rel) return events;

    if (rel.status === 'alliance') return events;
    if (rel.embargo === empireId || rel.embargo === 'mutual') return events;

    if (rel.status === 'trade') {
      rel.status = 'neutral';
      rel.tradeValue = 0;
      events.push(this._makeEvent(state, 'trade_cancelled',
        `${fromEmpire.name} cancelled their trade agreement with ${toEmpire.name} as part of the embargo!`,
        [empireId, targetId]));
    }

    if (rel.embargo && rel.embargo !== empireId) {
      rel.embargo = 'mutual';
    } else {
      rel.embargo = empireId;
    }

    adjustConfidence(toEmpire, -2);

    events.push(this._makeEvent(state, 'embargo_imposed',
      `${fromEmpire.name} imposed an EMBARGO on ${toEmpire.name}! Their territories now block ${toEmpire.name}'s trade routes.`,
      [empireId, targetId]));

    return events;
  }

  _liftEmbargo(state, empireId, action) {
    const events = [];
    const targetId = action.target_empire_id;
    const fromEmpire = state.empires[empireId];
    const toEmpire = state.empires[targetId];
    if (!fromEmpire || !toEmpire) return events;

    const key = getRelationKey(empireId, targetId);
    const rel = state.relations[key];
    if (!rel) return events;

    if (!rel.embargo) return events;

    if (rel.embargo === 'mutual') {
      rel.embargo = targetId;
    } else if (rel.embargo === empireId) {
      rel.embargo = null;
    } else {
      return events;
    }

    adjustConfidence(toEmpire, 1);

    events.push(this._makeEvent(state, 'embargo_lifted',
      `${fromEmpire.name} lifted their embargo on ${toEmpire.name}.`,
      [empireId, targetId]));

    return events;
  }

  _breakAlliance(state, empireId, action) {
    const events = [];
    const targetId = action.target_empire_id;
    const key = getRelationKey(empireId, targetId);
    const rel = state.relations[key];
    if (!rel || rel.status !== 'alliance') return events;

    rel.status = 'neutral';
    adjustConfidence(state.empires[empireId], -5);
    adjustConfidence(state.empires[targetId], -5);

    events.push(this._makeEvent(state, 'alliance_broken',
      `${state.empires[empireId].name} broke their alliance with ${state.empires[targetId].name}!`,
      [empireId, targetId]));

    return events;
  }

  _sendMessage(state, empireId, action) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromEmpireId: empireId,
      toEmpireId: action.target_empire_id,
      type: 'send_message',
      message: action.message || '',
      turn: state.meta.turn,
      status: 'delivered',
    };
    state.diplomacyQueue.push(msg);

    return [this._makeEvent(state, 'message_sent',
      `${state.empires[empireId].name} sent a message to ${state.empires[action.target_empire_id].name}: "${(action.message || '').slice(0, 80)}"`,
      [empireId, action.target_empire_id])];
  }

  _makeEvent(state, type, description, involvedEmpires) {
    return {
      turn: state.meta.turn,
      type,
      description,
      involvedEmpires,
    };
  }
}
