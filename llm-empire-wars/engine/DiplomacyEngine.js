import { getRelationKey } from './GameState.js';

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
            events.push(...this._proposePeace(state, empireId, action));
            break;
          case 'propose_trade':
            events.push(...this._proposeTrade(state, empireId, action));
            break;
          case 'propose_alliance':
            events.push(...this._proposeAlliance(state, empireId, action));
            break;
          case 'break_alliance':
            events.push(...this._breakAlliance(state, empireId, action));
            break;
          case 'send_message':
            events.push(...this._sendMessage(state, empireId, action));
            break;
        }
      }
    }

    return events;
  }

  resolveIncomingProposals(state) {
    const events = [];
    const pending = state.diplomacyQueue.filter(m => m.status === 'pending');

    for (const msg of pending) {
      const responderActions = state.pendingActions[msg.toEmpireId] || [];

      const accepted = responderActions.some(a =>
        a.type === 'accept_proposal' && a.target_empire_id === msg.fromEmpireId
      );

      const rejected = responderActions.some(a =>
        a.type === 'reject_proposal' && a.target_empire_id === msg.fromEmpireId
      );

      const counterProposal = responderActions.some(a =>
        a.type === msg.type && a.target_empire_id === msg.fromEmpireId
      );

      if (rejected) {
        msg.status = 'rejected';
        events.push(this._makeEvent(state, 'proposal_rejected',
          `${state.empires[msg.toEmpireId].name} rejected ${state.empires[msg.fromEmpireId].name}'s ${msg.type.replace('propose_', '')} proposal`,
          [msg.fromEmpireId, msg.toEmpireId]));
        continue;
      }

      if (!accepted && !counterProposal) {
        msg.status = 'ignored';
        continue;
      }

      msg.status = 'accepted';
      const key = getRelationKey(msg.fromEmpireId, msg.toEmpireId);
      const rel = state.relations[key];

      if (rel) {
        if (msg.type === 'propose_trade' && rel.status === 'neutral') {
          rel.status = 'trade';
          rel.tradeValue = 2;
          events.push(this._makeEvent(state, 'trade_established',
            `${state.empires[msg.fromEmpireId].name} and ${state.empires[msg.toEmpireId].name} established a trade agreement!`,
            [msg.fromEmpireId, msg.toEmpireId]));
        } else if (msg.type === 'propose_alliance' && (rel.status === 'trade' || rel.status === 'neutral')) {
          rel.status = 'alliance';
          events.push(this._makeEvent(state, 'alliance_formed',
            `${state.empires[msg.fromEmpireId].name} and ${state.empires[msg.toEmpireId].name} formed an alliance!`,
            [msg.fromEmpireId, msg.toEmpireId]));
        } else if (msg.type === 'propose_peace' && rel.status === 'war') {
          rel.status = 'neutral';
          rel.peaceCooldownUntil = state.meta.turn + 3;
          events.push(this._makeEvent(state, 'peace_declared',
            `${state.empires[msg.fromEmpireId].name} and ${state.empires[msg.toEmpireId].name} declared peace!`,
            [msg.fromEmpireId, msg.toEmpireId]));
        }
      }
    }

    return events;
  }

  resolveMatchingProposals(state, allActions) {
    const events = [];
    const proposalTypes = ['propose_trade', 'propose_alliance', 'propose_peace'];
    const resolved = new Set();

    for (const [empireA, actionsA] of Object.entries(allActions)) {
      for (const actionA of actionsA) {
        if (!proposalTypes.includes(actionA.type)) continue;
        const empireB = actionA.target_empire_id;
        const pairKey = getRelationKey(empireA, empireB) + ':' + actionA.type;
        if (resolved.has(pairKey)) continue;

        const actionsB = allActions[empireB] || [];
        const match = actionsB.find(ab =>
          ab.type === actionA.type && ab.target_empire_id === empireA
        );
        if (!match) continue;

        resolved.add(pairKey);
        actionA._resolved = true;
        match._resolved = true;

        const key = getRelationKey(empireA, empireB);
        const rel = state.relations[key];
        if (!rel) continue;

        if (actionA.type === 'propose_trade' && rel.status === 'neutral') {
          rel.status = 'trade';
          rel.tradeValue = 2;
          events.push(this._makeEvent(state, 'trade_established',
            `${state.empires[empireA].name} and ${state.empires[empireB].name} mutually agreed to a trade agreement!`,
            [empireA, empireB]));
        } else if (actionA.type === 'propose_alliance' && (rel.status === 'trade' || rel.status === 'neutral')) {
          rel.status = 'alliance';
          events.push(this._makeEvent(state, 'alliance_formed',
            `${state.empires[empireA].name} and ${state.empires[empireB].name} mutually formed an alliance!`,
            [empireA, empireB]));
        } else if (actionA.type === 'propose_peace' && rel.status === 'war') {
          rel.status = 'neutral';
          rel.peaceCooldownUntil = state.meta.turn + 3;
          events.push(this._makeEvent(state, 'peace_declared',
            `${state.empires[empireA].name} and ${state.empires[empireB].name} mutually declared peace!`,
            [empireA, empireB]));
        }
      }
    }

    return events;
  }

  updateReputations(state) {
    for (const rel of Object.values(state.relations)) {
      if (rel.status === 'trade' || rel.status === 'alliance') {
        state.empires[rel.empireA].reputation = Math.min(100, state.empires[rel.empireA].reputation + 2);
        state.empires[rel.empireB].reputation = Math.min(100, state.empires[rel.empireB].reputation + 2);
      }
    }
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

    if (wasAllied) {
      state.empires[empireId].reputation = Math.max(0, state.empires[empireId].reputation - 30);
      events.push(this._makeEvent(state, 'betrayal',
        `${state.empires[empireId].name} BETRAYED their alliance with ${state.empires[targetId].name}!`,
        [empireId, targetId]));
    } else if (wasTrade) {
      state.empires[empireId].reputation = Math.max(0, state.empires[empireId].reputation - 15);
    }

    events.push(this._makeEvent(state, 'war_declared',
      `${state.empires[empireId].name} declared WAR on ${state.empires[targetId].name}!`,
      [empireId, targetId]));

    return events;
  }

  _proposePeace(state, empireId, action) {
    return this._queueProposal(state, empireId, action.target_empire_id, 'propose_peace',
      `${state.empires[empireId].name} proposes peace to ${state.empires[action.target_empire_id].name}`);
  }

  _proposeTrade(state, empireId, action) {
    return this._queueProposal(state, empireId, action.target_empire_id, 'propose_trade',
      `${state.empires[empireId].name} proposes a trade agreement to ${state.empires[action.target_empire_id].name}`);
  }

  _proposeAlliance(state, empireId, action) {
    return this._queueProposal(state, empireId, action.target_empire_id, 'propose_alliance',
      `${state.empires[empireId].name} proposes an alliance with ${state.empires[action.target_empire_id].name}`);
  }

  _breakAlliance(state, empireId, action) {
    const events = [];
    const targetId = action.target_empire_id;
    const key = getRelationKey(empireId, targetId);
    const rel = state.relations[key];
    if (!rel || rel.status !== 'alliance') return events;

    rel.status = 'neutral';
    state.empires[empireId].reputation = Math.max(0, state.empires[empireId].reputation - 25);

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

  _queueProposal(state, fromId, toId, type, description) {
    const msg = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromEmpireId: fromId,
      toEmpireId: toId,
      type,
      message: description,
      turn: state.meta.turn,
      status: 'pending',
    };
    state.diplomacyQueue.push(msg);

    return [this._makeEvent(state, type, description, [fromId, toId])];
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
