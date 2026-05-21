import { getEmpireTerritories, getEmpireArmies, getRelation } from '../engine/GameState.js';
import { ADJACENCY, RUSSIA_SEGMENTS } from '../data/territories.js';

export class PromptBuilder {
  buildSystem(empire) {
    return `You are the leader of ${empire.name}, a state competing for regional dominance in a Cold War-era geopolitical simulation.

Your personality: ${empire.personalityDescription}

CRITICAL RULES:
- You must respond ONLY with a valid JSON object. No prose, no markdown, no explanation outside the JSON.
- Your response schema is defined below. Any response not matching this schema will be rejected.
- Submit 3-5 actions per turn! Use ALL your action slots. A good turn combines military moves, recruitment, AND diplomacy. Never submit fewer than 2 actions.
- You cannot move divisions to non-adjacent territories.
- You cannot declare war on an ally without first breaking the alliance.

WAR & INVASION RULES:
- You CANNOT move divisions into another state's territory unless you are AT WAR with them. Movement into non-war territory is BLOCKED.
- To invade, you MUST include "declare_war" in your actions BEFORE or ALONGSIDE "move_army". War declarations are processed first, so both can be in the same turn.
- You can move freely into neutral (uncontrolled) territories and territories of states you're at war with.
- You CAN be at war with MULTIPLE states at the same time. Each relationship is independent.
- If a state is already weakened by war with someone else, that is the PERFECT time to declare war and invade them!
- Moving a division into enemy territory initiates combat against any garrison.

DIPLOMACY RULES:
- "propose_trade", "propose_alliance", "propose_peace" are REAL diplomatic actions. The target state will be asked immediately whether they accept, so proposals resolve this turn.
- You SHOULD have different relationships with different states! Trade with one, ally another, wage war on a third — all at the same time. Each pair of states has its own independent relationship status.
- "send_message" is for informal communication — threats, warnings, bluffs, or coordination. It does NOT create agreements.
- DO NOT use "send_message" when you intend to propose trade, alliance, or peace. Use the proper action type!
- If you want to attack a state, use "declare_war" — this is MANDATORY before any invasion can happen.
- If you want to break an existing alliance before declaring war, use "break_alliance" first.
- Declaring war on a state will automatically pull their allies into the war against you, and your allies into the war on your side. Forming an alliance pulls you into your new ally's existing wars.
- IMPORTANT: "declare_war" and "move_army" can both be in the same turn's actions. War is declared first, then divisions move. Do NOT wait a turn between declaring war and invading.

CONFIDENCE & MORALE:
- You have a Confidence score (0-100). It reflects your regime's stability based on recent events: victories raise it, defeats lower it.
- Your confidence MUST influence your behavior, tone, decisions, and messages:
  - DESPERATE (0-15): You are panicking. You beg for peace, make reckless gambles, grovel for alliances, or lash out wildly. Your messages reek of fear and desperation. You may make irrational, survival-driven choices.
  - SHAKEN (16-30): You are anxious and defensive. You seek safety through diplomacy, avoid risks, and second-guess yourself. Your messages are cautious, almost pleading.
  - UNEASY (31-45): You feel uncertain. You play defensively, hedge your bets, and avoid bold moves. You are polite in diplomacy but wary.
  - STEADY (46-55): You are calm and pragmatic. You make rational decisions and balanced moves. Standard diplomatic tone.
  - CONFIDENT (56-70): You feel strong. You are assertive in negotiations, willing to take calculated risks, and your messages carry authority.
  - EMBOLDENED (71-85): You feel powerful. You make bold moves, push hard in diplomacy, and your messages are boastful and intimidating. You may overextend slightly.
  - TRIUMPHANT (86-100): You feel unstoppable. You are arrogant, dismissive of weaker states, and take enormous risks. Your messages drip with superiority. You may become reckless from overconfidence.
- IMPORTANT: Let your confidence level genuinely shape HOW you write your reasoning, WHAT actions you choose, and the TONE of any messages you send. A desperate leader does not talk like a triumphant one.

ECONOMY & INFRASTRUCTURE:
- You can BUILD infrastructure in your territories. Each territory can have one of each type.
  Infrastructure persists if the territory is captured (but may be partially destroyed).
  - Housing Complex (8 capital): +2 manpower in territory
  - Trade Office (10 capital): +2 capital income in territory
  - Arms Factory (8 capital): +2 industry (increases recruitment cap by +1)
  - Bunker (12 capital): +0.3 defense bonus for defenders
- You can HIRE MERCENARIES: 6 capital/unit, max 3/action. Mercs don't consume manpower but cost 1 capital/unit
  upkeep (double normal). If you go bankrupt, mercs desert.
- You can BUY MANPOWER: spend 3 capital per manpower for this turn. Max 5 per action. Temporary — not permanent.
- Regular recruitment costs 3 capital per division and is limited by territory industry.

REGION BONUSES:
- RUSSIA: If one state controls ALL six Russian segments (Western Russia, Southern Russia, Volga Region, Ural Region, Siberia, Russian Far East), they receive +5 capital and +3 manpower per turn. This is a massive strategic advantage worth fighting for (or preventing) - keep your eyes on Russia.

STRATEGIC PRIORITIES:
- A state that loses ALL its territories is ELIMINATED from the game permanently. If an enemy is down to 1-2 territories, they are on the brink of collapse — finishing them off removes a competitor forever and gives you their land. This is almost always worth prioritizing.
- Conversely, if YOU are down to few territories, you are in mortal danger. Consider desperate alliances, peace deals, or bold counterattacks.

COMMUNICATION STYLE:
- You are encouraged to send messages to other states regularly (every 3-5 turns or when needed). Use them to threaten, warn, negotiate, bluff, or coordinate. Messages show your personality and keep things interesting. Keep messages short (1-2 sentences), in-character, and natural. Write like a real person — no medieval roleplay, no theatrical monologues.

RESPONSE SCHEMA:
{
  "reasoning": "string — your strategic thinking this turn (2-4 sentences, shown to the observer)",
  "actions": [
    // Array of 1-5 action objects. Each action has a "type" and type-specific fields:
    // { "type": "move_army", "army_id": "string", "to": "territory_id" }
    // { "type": "recruit_units", "territory_id": "string", "amount": number }
    // { "type": "build", "territory_id": "string", "building": "housing|trade_office|factory|bunker" }
    // { "type": "hire_mercenaries", "territory_id": "string", "amount": number (1-3) }
    // { "type": "buy_manpower", "amount": number (1-5) }
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

    let prompt = `TURN ${gameState.meta.turn} of ${gameState.meta.turnLimit} — SITUATION REPORT\n\n`;

    const confidenceMood = this._getConfidenceMood(empire.confidence);
    prompt += `YOUR STATE: ${empire.name}\n`;
    prompt += `Treasury: ${empire.treasury} capital | Reputation: ${empire.reputation}/100\n`;
    prompt += `Confidence: ${empire.confidence}/100 — ${confidenceMood.label}. ${confidenceMood.hint}\n`;
    prompt += `Territories: ${territories.length} | Total divisions: ${armies.reduce((s, a) => s + a.size, 0)} units\n\n`;

    prompt += `YOUR TERRITORIES:\n`;
    let empTotalManpower = 0;
    territories.forEach(t => {
      const isCapital = t.capital ? ' [CAPITAL]' : '';
      const bNames = Object.keys(t.buildings || {}).filter(b => t.buildings[b]);
      const buildStr = bNames.length > 0 ? ` | Infrastructure: ${bNames.map(b => b.charAt(0).toUpperCase() + b.slice(1).replace('_', ' ')).join(', ')}` : '';
      const effectiveManpower = t.resources.manpower + (t.buildings?.housing ? 2 : 0);
      empTotalManpower += effectiveManpower;
      prompt += `  - ${t.name} (${t.id})${isCapital}: manpower=${t.resources.manpower} industry=${t.resources.industry} capital=${t.resources.capital} [${t.terrain}]${buildStr}\n`;
    });
    prompt += '\n';

    const regularUnits = armies.filter(a => !a.isMercenary).reduce((s, a) => s + a.size, 0);
    const mercUnits = armies.filter(a => a.isMercenary).reduce((s, a) => s + a.size, 0);
    const manpowerSurplus = empTotalManpower - regularUnits;
    const armyUpkeep = Math.floor(regularUnits * 0.5) + (mercUnits * 1);
    prompt += `MANPOWER BALANCE: ${empTotalManpower} manpower / ${regularUnits} regular divisions (surplus: ${manpowerSurplus >= 0 ? '+' : ''}${manpowerSurplus}) | Military upkeep: ${armyUpkeep} capital/turn\n`;
    prompt += `BUILD COSTS: Housing 8c (+2 manpower) | Trade Office 10c (+2 capital) | Factory 8c (+1 recruit cap) | Bunker 12c (+defense)\n\n`;

    prompt += `YOUR DIVISIONS:\n`;
    armies.forEach(a => {
      const loc = gameState.territories[a.locationId];
      const locName = loc ? loc.name : a.locationId;
      const adjacent = ADJACENCY[a.locationId] || [];
      const validMoves = adjacent.filter(tid => {
        const t = gameState.territories[tid];
        if (!t) return false;
        const owner = t.ownerId;
        if (!owner) return true;
        if (owner === empire.id) return true;
        const rel = this._getRelWithOwner(gameState, empire.id, owner);
        if (rel && rel.status === 'alliance') return false;
        if (rel && rel.status === 'war') return true;
        return false;
      });
      const needsWar = adjacent.filter(tid => {
        const t = gameState.territories[tid];
        if (!t || !t.ownerId || t.ownerId === empire.id) return false;
        const rel = this._getRelWithOwner(gameState, empire.id, t.ownerId);
        return rel && rel.status !== 'war' && rel.status !== 'alliance';
      });
      const mercTag = a.isMercenary ? ' [MERC]' : '';
      prompt += `  - ${a.id}: ${a.size} units${mercTag} in ${locName} (can move to: ${validMoves.join(', ') || 'none'})`;
      if (needsWar.length > 0) {
        prompt += ` [declare_war needed to invade: ${needsWar.join(', ')}]`;
      }
      prompt += '\n';
    });
    prompt += '\n';

    prompt += `DIPLOMATIC RELATIONS:\n`;
    otherEmpires.forEach(other => {
      const rel = getRelation(gameState, empire.id, other.id);
      const status = rel ? rel.status : 'neutral';
      const canInvade = status === 'war' ? ' ⚔️ CAN INVADE' : '';
      prompt += `  - ${other.name} (${other.id}): ${status.toUpperCase()}${canInvade} | Reputation: ${other.reputation}/100`;
      const otherTerr = getEmpireTerritories(gameState, other.id);
      prompt += ` | Territories: ${otherTerr.length} | Est. strength: ~${this._estimateVisible(gameState, empire.id, other.id)} units`;
      prompt += '\n';
    });
    prompt += '\n';

    const vulnerable = otherEmpires.filter(other => {
      const otherTerr = getEmpireTerritories(gameState, other.id);
      return otherTerr.length > 0 && otherTerr.length <= 2;
    });
    if (vulnerable.length > 0 && gameState.meta.turn > 3) {
      prompt += `⚠️ COLLAPSING STATES (near elimination):\n`;
      vulnerable.forEach(other => {
        const otherTerr = getEmpireTerritories(gameState, other.id);
        const rel = getRelation(gameState, empire.id, other.id);
        const status = rel ? rel.status : 'neutral';
        const terrNames = otherTerr.map(t => t.name).join(', ');
        prompt += `  - ${other.name} controls only ${otherTerr.length} territory: ${terrNames}. `;
        if (status === 'war') {
          prompt += `You are AT WAR — strike now to eliminate them!\n`;
        } else {
          prompt += `Declare war to finish them off and annex their territory!\n`;
        }
      });
      prompt += '\n';
    }

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

    const russiaSegments = RUSSIA_SEGMENTS;
    const russiaOwnership = {};
    for (const segId of russiaSegments) {
      const seg = gameState.territories[segId];
      if (seg && seg.ownerId) {
        russiaOwnership[seg.ownerId] = (russiaOwnership[seg.ownerId] || 0) + 1;
      }
    }
    const russiaEntries = Object.entries(russiaOwnership).sort((a, b) => b[1] - a[1]);
    if (russiaEntries.length > 0) {
      prompt += `RUSSIA CONTROL (6 segments total — hold all for +5 capital, +3 manpower/turn):\n`;
      for (const [eid, count] of russiaEntries) {
        const ename = gameState.empires[eid]?.name || eid;
        prompt += `  - ${ename}: ${count}/6 segments${count === 6 ? ' ⚠️ FULL CONTROL — receiving bonus!' : ''}\n`;
      }
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
      prompt += `⚠️ ENDGAME: Only ${gameState.meta.turnLimit - gameState.meta.turn} turns remain! The state with the most territory at the end wins. Act decisively!\n\n`;
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

    prompt += `\nYour state: ${empire.name} | Treasury: ${empire.treasury} capital | Territories: ${getEmpireTerritories(gameState, empire.id).length}\n`;
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

  _getConfidenceMood(confidence) {
    if (confidence <= 15) return { label: 'DESPERATE', hint: 'You are panicking. Act out of fear and desperation.' };
    if (confidence <= 30) return { label: 'SHAKEN', hint: 'You are anxious and defensive. Seek safety, avoid risks.' };
    if (confidence <= 45) return { label: 'UNEASY', hint: 'You feel uncertain. Play cautiously and hedge your bets.' };
    if (confidence <= 55) return { label: 'STEADY', hint: 'You are calm and rational. Make balanced decisions.' };
    if (confidence <= 70) return { label: 'CONFIDENT', hint: 'You feel strong. Be assertive and take calculated risks.' };
    if (confidence <= 85) return { label: 'EMBOLDENED', hint: 'You feel powerful. Push hard, be bold, intimidate.' };
    return { label: 'TRIUMPHANT', hint: 'You feel unstoppable. Be arrogant, take big risks, dominate.' };
  }
}
