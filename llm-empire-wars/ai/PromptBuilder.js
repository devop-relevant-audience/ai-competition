import { getEmpireTerritories, getEmpireArmies, getRelation } from '../engine/GameState.js';
import { ADJACENCY } from '../data/territories.js';

export class PromptBuilder {
  buildSystem(empire) {
    return `You are the strategic leader of ${empire.name}, an empire competing for dominance in Europe.

Your personality: ${empire.personalityDescription}

CRITICAL RULES:
- You must respond ONLY with a valid JSON object. No prose, no markdown, no explanation outside the JSON.
- Your response schema is defined below. Any response not matching this schema will be rejected.
- You can submit 1–5 actions per turn.
- You cannot move armies to non-adjacent territories.
- You cannot declare war on an ally without first breaking the alliance.
- Moving an army into a neutral territory claims it automatically.
- Moving an army into an enemy territory initiates combat.

DIPLOMACY RULES:
- "propose_trade", "propose_alliance", "propose_peace" are REAL diplomatic actions that create formal proposals.
- "send_message" is for informal communication — threats, taunts, warnings, bluffs, or coordination. It does NOT create agreements.
- To ACCEPT a pending proposal from another empire, use: { "type": "accept_proposal", "target_empire_id": "..." }
- To REJECT a pending proposal, use: { "type": "reject_proposal", "target_empire_id": "..." }
- If you and another empire both submit the same proposal type to each other in the same turn, it is automatically accepted.
- DO NOT use "send_message" when you intend to propose trade, alliance, or peace. Use the proper action type!

COMMUNICATION STYLE:
- You are encouraged to send messages to other empires regularly (every 3-5 turns or when needed). Use them to threaten, taunt, negotiate, bluff, or coordinate. Messages are part of the fun — they show your personality and keep things interesting. Keep messages short (1-2 sentences), in-character, and dramatic.

RESPONSE SCHEMA:
{
  "reasoning": "string — your strategic thinking this turn (2–4 sentences, shown to the observer)",
  "actions": [
    // Array of 1–4 action objects. Each action has a "type" and type-specific fields:
    // { "type": "move_army", "army_id": "string", "to": "territory_id" }
    // { "type": "recruit_units", "territory_id": "string", "amount": number }
    // { "type": "declare_war", "target_empire_id": "string" }
    // { "type": "propose_peace", "target_empire_id": "string" }
    // { "type": "propose_trade", "target_empire_id": "string" }
    // { "type": "propose_alliance", "target_empire_id": "string" }
    // { "type": "accept_proposal", "target_empire_id": "string" }
    // { "type": "reject_proposal", "target_empire_id": "string" }
    // { "type": "break_alliance", "target_empire_id": "string" }
    // { "type": "send_message", "target_empire_id": "string", "message": "string" }
    // { "type": "do_nothing" }
  ]
}`;
  }

  buildUser(empire, gameState) {
    const territories = getEmpireTerritories(gameState, empire.id);
    const armies = getEmpireArmies(gameState, empire.id);
    const otherEmpires = Object.values(gameState.empires).filter(e => e.id !== empire.id && !e.isEliminated);

    let prompt = `TURN ${gameState.meta.turn} of ${gameState.meta.turnLimit} — WORLD STATE\n\n`;

    prompt += `YOUR EMPIRE: ${empire.name}\n`;
    prompt += `Treasury: ${empire.treasury} gold | Reputation: ${empire.reputation}/100\n`;
    prompt += `Territories: ${territories.length} | Total armies: ${armies.reduce((s, a) => s + a.size, 0)} units\n\n`;

    prompt += `YOUR TERRITORIES:\n`;
    territories.forEach(t => {
      const isCapital = t.capital ? ' [CAPITAL]' : '';
      prompt += `  - ${t.name} (${t.id})${isCapital}: food=${t.resources.food} prod=${t.resources.production} gold=${t.resources.gold} [${t.terrain}]\n`;
    });
    prompt += '\n';

    prompt += `YOUR ARMIES:\n`;
    armies.forEach(a => {
      const loc = gameState.territories[a.locationId];
      const locName = loc ? loc.name : a.locationId;
      const adjacent = ADJACENCY[a.locationId] || [];
      const validMoves = adjacent.filter(tid => {
        const rel = this._getRelWithOwner(gameState, empire.id, gameState.territories[tid]?.ownerId);
        return !(rel && rel.status === 'alliance');
      });
      prompt += `  - ${a.id}: ${a.size} units in ${locName} (can move to: ${validMoves.join(', ') || 'none'})\n`;
    });
    prompt += '\n';

    prompt += `DIPLOMATIC RELATIONS:\n`;
    otherEmpires.forEach(other => {
      const rel = getRelation(gameState, empire.id, other.id);
      const status = rel ? rel.status : 'neutral';
      prompt += `  - ${other.name} (${other.id}): ${status.toUpperCase()} | Reputation: ${other.reputation}/100`;
      const otherTerr = getEmpireTerritories(gameState, other.id);
      const otherArmies = getEmpireArmies(gameState, other.id);
      prompt += ` | Territories: ${otherTerr.length} | Total units: ~${this._estimateVisible(gameState, empire.id, other.id)}`;
      prompt += '\n';
    });
    prompt += '\n';

    const pendingProposals = gameState.diplomacyQueue.filter(m =>
      m.toEmpireId === empire.id &&
      m.status === 'pending' &&
      ['propose_trade', 'propose_alliance', 'propose_peace'].includes(m.type)
    );
    if (pendingProposals.length > 0) {
      prompt += `⚡ PENDING PROPOSALS (you MUST respond with accept_proposal or reject_proposal):\n`;
      pendingProposals.forEach(m => {
        const from = gameState.empires[m.fromEmpireId];
        const typeLabel = m.type.replace('propose_', '').toUpperCase();
        prompt += `  - ${from.name} (${m.fromEmpireId}) proposed ${typeLabel} → use { "type": "accept_proposal", "target_empire_id": "${m.fromEmpireId}" } to ACCEPT or { "type": "reject_proposal", "target_empire_id": "${m.fromEmpireId}" } to REJECT\n`;
      });
      prompt += '\n';
    }

    const incomingMessages = gameState.diplomacyQueue.filter(m =>
      m.toEmpireId === empire.id &&
      m.turn >= gameState.meta.turn - 1 &&
      m.type === 'send_message'
    );
    if (incomingMessages.length > 0) {
      prompt += `INCOMING MESSAGES:\n`;
      incomingMessages.forEach(m => {
        const from = gameState.empires[m.fromEmpireId];
        prompt += `  - From ${from.name}: "${m.message}"\n`;
      });
      prompt += '\n';
    }

    const visible = this._getVisibleNeighbors(gameState, empire.id);
    if (visible.length > 0) {
      prompt += `NEIGHBORING TERRITORIES YOU CAN SEE:\n`;
      visible.forEach(v => {
        prompt += `  - ${v.name} (${v.id}): owned by ${v.ownerName} | ${v.armyInfo} [${v.terrain}]\n`;
      });
      prompt += '\n';
    }

    if (gameState.activeEvents.length > 0) {
      prompt += `ACTIVE WORLD EVENTS:\n`;
      gameState.activeEvents.forEach(e => {
        const t = gameState.territories[e.affectedTerritoryId];
        prompt += `  - ${e.name} in ${t ? t.name : 'unknown'} (expires turn ${e.expiresOnTurn})\n`;
      });
      prompt += '\n';
    }

    const recentEvents = gameState.eventLog.filter(e => e.turn >= gameState.meta.turn - 3).slice(-12);
    if (recentEvents.length > 0) {
      prompt += `RECENT HISTORY (last 3 turns):\n`;
      recentEvents.forEach(e => {
        prompt += `  [Turn ${e.turn}] ${e.description}\n`;
      });
      prompt += '\n';
    }

    if (gameState.meta.turn > gameState.meta.turnLimit * 0.7) {
      prompt += `⚠️ LATE GAME WARNING: Only ${gameState.meta.turnLimit - gameState.meta.turn} turns remain! The empire with the most territories at the end wins. Act decisively!\n\n`;
    }

    prompt += `Submit your JSON response now.`;

    return prompt;
  }

  _getRelWithOwner(gameState, empireId, ownerId) {
    if (!ownerId || empireId === ownerId) return null;
    const key = empireId < ownerId ? `${empireId}__${ownerId}` : `${ownerId}__${empireId}`;
    return gameState.relations[key] || null;
  }

  _estimateVisible(gameState, viewerId, targetId) {
    const viewerTerritories = new Set(
      getEmpireTerritories(gameState, viewerId).map(t => t.id)
    );
    const adjacentToViewer = new Set();
    for (const tid of viewerTerritories) {
      (ADJACENCY[tid] || []).forEach(a => adjacentToViewer.add(a));
    }

    let visible = 0;
    for (const army of Object.values(gameState.armies)) {
      if (army.empireId !== targetId) continue;
      if (viewerTerritories.has(army.locationId) || adjacentToViewer.has(army.locationId)) {
        visible += army.size;
      }
    }
    return visible > 0 ? visible : '??';
  }

  _getVisibleNeighbors(gameState, empireId) {
    const myTerritories = new Set(
      getEmpireTerritories(gameState, empireId).map(t => t.id)
    );
    const neighbors = new Set();
    for (const tid of myTerritories) {
      (ADJACENCY[tid] || []).forEach(a => {
        if (!myTerritories.has(a)) neighbors.add(a);
      });
    }

    return Array.from(neighbors).map(tid => {
      const t = gameState.territories[tid];
      if (!t) return null;
      const owner = t.ownerId ? gameState.empires[t.ownerId] : null;
      const armies = Object.values(gameState.armies).filter(a => a.locationId === tid);
      const armyInfo = armies.length > 0 ? `armies present (${armies.length} groups)` : 'no armies';

      return {
        id: tid,
        name: t.name,
        terrain: t.terrain,
        ownerName: owner ? owner.name : 'Neutral',
        armyInfo,
      };
    }).filter(Boolean);
  }
}
