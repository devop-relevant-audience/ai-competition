import { getEmpireTerritories, getEmpireArmies, getRelation } from '../engine/GameState.js';
import { ADJACENCY } from '../data/territories.js';

export class PromptBuilder {
  buildSystem(empire) {
    return `You are the strategic leader of ${empire.name}, an empire competing for dominance in Europe.

Your personality: ${empire.personalityDescription}

CRITICAL RULES:
- You must respond ONLY with a valid JSON object. No prose, no markdown, no explanation outside the JSON.
- Your response schema is defined below. Any response not matching this schema will be rejected.
- Submit 3–5 actions per turn! Use ALL your action slots. A good turn combines military moves, recruitment, AND diplomacy. Never submit fewer than 2 actions.
- You cannot move armies to non-adjacent territories.
- You cannot declare war on an ally without first breaking the alliance.
- Moving an army into enemy or neutral territory initiates combat against any garrison.

DIPLOMACY RULES:
- "propose_trade", "propose_alliance", "propose_peace" are REAL diplomatic actions. The target empire will be asked immediately whether they accept, so proposals resolve this turn.
- You SHOULD have different relationships with different empires! Trade with one, ally another, wage war on a third — all at the same time. Each pair of empires has its own independent relationship status.
- "send_message" is for informal communication — threats, taunts, warnings, bluffs, or coordination. It does NOT create agreements.
- DO NOT use "send_message" when you intend to propose trade, alliance, or peace. Use the proper action type!
- If you want war, use "declare_war". If you want to break an existing alliance, use "break_alliance" first.
- Declaring war on an empire will automatically pull their allies into the war against you, and your allies into the war on your side. Forming an alliance pulls you into your new ally's existing wars.

COMMUNICATION STYLE:
- You are encouraged to send messages to other empires regularly (every 3-5 turns or when needed). Use them to threaten, taunt, negotiate, bluff, or coordinate. Messages are part of the fun — they show your personality and keep things interesting. Keep messages short (1-2 sentences), in-character, and dramatic.

RESPONSE SCHEMA:
{
  "reasoning": "string — your strategic thinking this turn (2–4 sentences, shown to the observer)",
  "actions": [
    // Array of 1–5 action objects. Each action has a "type" and type-specific fields:
    // { "type": "move_army", "army_id": "string", "to": "territory_id" }
    // { "type": "recruit_units", "territory_id": "string", "amount": number }
    // { "type": "declare_war", "target_empire_id": "string" }
    // { "type": "propose_peace", "target_empire_id": "string" }
    // { "type": "propose_trade", "target_empire_id": "string" }
    // { "type": "propose_alliance", "target_empire_id": "string" }
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

    prompt += `YOUR DIPLOMATIC RELATIONS:\n`;
    otherEmpires.forEach(other => {
      const rel = getRelation(gameState, empire.id, other.id);
      const status = rel ? rel.status : 'neutral';
      prompt += `  - ${other.name} (${other.id}): ${status.toUpperCase()} | Reputation: ${other.reputation}/100`;
      const otherTerr = getEmpireTerritories(gameState, other.id);
      prompt += ` | Territories: ${otherTerr.length} | Total units: ~${this._estimateVisible(gameState, empire.id, other.id)}`;
      prompt += '\n';
    });
    prompt += '\n';

    const thirdPartyConflicts = this._getThirdPartyRelations(gameState, empire.id);
    if (thirdPartyConflicts.length > 0) {
      prompt += `WORLD DIPLOMACY (other empires' relations with each other):\n`;
      thirdPartyConflicts.forEach(r => {
        prompt += `  - ${r.nameA} ↔ ${r.nameB}: ${r.status.toUpperCase()}\n`;
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

  buildProposalSystem(empire) {
    return `You are the leader of ${empire.name}. ${empire.personalityDescription}

You must respond with a JSON object containing your decisions on diplomatic proposals. Be decisive — accept proposals that benefit your strategy, reject ones that don't.

RESPONSE FORMAT:
{
  "decisions": [
    { "from_empire_id": "empire_id", "accept": true/false, "reason": "brief reason (1 sentence)" }
  ]
}`;
  }

  buildProposalUser(empire, proposals, gameState) {
    let prompt = `DIPLOMATIC PROPOSALS REQUIRING YOUR RESPONSE:\n\n`;

    for (const p of proposals) {
      const from = gameState.empires[p.empireId];
      if (!from) continue;
      const rel = getRelation(gameState, empire.id, p.empireId);
      const status = rel ? rel.status : 'neutral';
      const type = p.action.type.replace('propose_', '').toUpperCase();
      const fromTerr = getEmpireTerritories(gameState, p.empireId).length;
      const fromArmies = getEmpireArmies(gameState, p.empireId).reduce((s, a) => s + a.size, 0);

      prompt += `- ${from.name} (${p.empireId}) proposes ${type}\n`;
      prompt += `  Current relation: ${status.toUpperCase()} | Their strength: ${fromTerr} territories, ~${fromArmies} units | Reputation: ${from.reputation}/100\n`;
    }

    prompt += `\nYour empire: ${empire.name} | Treasury: ${empire.treasury}g | Territories: ${getEmpireTerritories(gameState, empire.id).length}\n`;
    prompt += `\nRespond with your JSON decisions now.`;

    return prompt;
  }

  _getThirdPartyRelations(gameState, selfId) {
    const results = [];
    for (const rel of Object.values(gameState.relations)) {
      if (rel.empireA === selfId || rel.empireB === selfId) continue;
      if (rel.status === 'neutral') continue;
      const eA = gameState.empires[rel.empireA];
      const eB = gameState.empires[rel.empireB];
      if (!eA || eA.isEliminated || !eB || eB.isEliminated) continue;
      results.push({ nameA: eA.name, nameB: eB.name, status: rel.status });
    }
    return results;
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
