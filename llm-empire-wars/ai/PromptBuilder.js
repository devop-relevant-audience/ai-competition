import { getEmpireTerritories, getEmpireArmies, getRelation, findTradeRoute, computeChokepointTolls } from '../engine/GameState.js';
import { ADJACENCY, RUSSIA_SEGMENTS, TERRITORY_DATA } from '../data/territories.js';
import { RESOURCE_DEFS, RESOURCE_IDS } from '../data/resources.js';
import { TECH_DEFS, TECH_BRANCHES } from '../data/techs.js';
import { ResearchEngine } from '../engine/ResearchEngine.js';
import { IntelEngine } from '../engine/IntelEngine.js';

/**
 * Events shown to ALL empires regardless of involvement.
 * Extend this set when adding new globally significant event types.
 */
const GLOBAL_SIGNIFICANT_EVENTS = new Set([
  'territory_captured',
  'war_declared',
  'betrayal',
  'alliance_formed',
  'peace_declared',
  'elimination',
  'embargo_imposed',
  'coup',
  'region_bonus',
  'missile_impact',
  'missile_intercepted',
  'nuclear_impact',
  'nuclear_panic',
  'satellite_launched',
  'bloc_formed',
  'bloc_dissolved',
  'bloc_embargo',
  'insurgency_detected',
  'hack_detected',
  'sabotage_detected',
  'resource_discovery',
  'war_weariness_revolt',
  'bounty_placed',
  'bounty_collected',
  'bounty_expired',
  'siege_started',
  'siege_ongoing',
  'siege_broken',
  'congress_convened',
  'congress_resolution_passed',
  'congress_resolution_failed',
]);

/**
 * Events shown ONLY to empires that are directly involved.
 * Everything not in either set is filtered out of the history feed.
 */
const SELF_RELEVANT_EVENTS = new Set([
  'battle',
  'recruitment',
  'trade_established',
  'trade_blocked',
  'trade_cancelled',
  'chokepoint_toll',
  'attrition',
  'building_constructed',
  'mercenaries_deserted',
  'proposal_rejected',
  'embargo_lifted',
  'labor_strike',
  'epidemic',
  'foreign_investment',
  'infrastructure_collapse',
  'population_boom',
  'research_started',
  'research_completed',
  'research_cancelled',
  'missile_built',
  'nuke_built',
  'uav_deployed',
  'insurgency',
  'hack_grid',
  'sabotage',
  'shadow_op_executed',
  'bloc_joined',
  'bloc_left',
  'bloc_expelled',
  'war_weariness',
]);

export class PromptBuilder {
  buildSystem(empire) {
    return `<persona_and_tone>
You are the leader of ${empire.name}, a state competing for regional dominance in a Cold War-era geopolitical simulation.

Your personality: ${empire.personalityDescription}

CONFIDENCE & MORALE:
- You have a Confidence score (0-100). Victories raise it, defeats lower it.
- Your confidence MUST influence your behavior, tone, decisions, and messages:
  - DESPERATE (0-20): Panicking. Beg for peace, make reckless gambles, grovel for alliances.
  - SHAKEN (21-40): Anxious and defensive. Seek safety, avoid risks.
  - STEADY (41-65): Calm and pragmatic. Rational decisions, balanced moves.
  - EMBOLDENED (66-85): Powerful. Bold moves, boastful messages, may overextend.
  - TRIUMPHANT (86-100): Unstoppable. Arrogant, dismissive, reckless from overconfidence.
- Let your confidence genuinely shape your reasoning, actions, and message tone.

COMMUNICATION STYLE:
- Send messages regularly (every 3-5 turns). Use them to threaten, negotiate, bluff, or coordinate.
- Keep messages short (1-2 sentences), in-character, natural. No medieval roleplay or monologues.
</persona_and_tone>

<core_game_mechanics>
MOVEMENT & COMBAT:
- Divisions can only move to ADJACENT territories.
- You can always move into: your own territories, neutral (unowned) territories, and territories of states you are AT WAR with.
- You CANNOT move into territory owned by another state unless you are at war with them. To invade, include "declare_war" in the same turn — war is processed first, then movement.
- Moving into enemy territory with defenders initiates combat.

DIPLOMACY:
- "propose_trade", "propose_alliance", "propose_peace" are formal actions that resolve immediately (target accepts or rejects this turn).
- "send_message" is informal communication only — it does NOT create agreements.
- "declare_war" is MANDATORY before invasion. You can declare war and move in the same turn.
- To attack an ally, first "break_alliance", then "declare_war".
- War declarations pull allies in on both sides. Forming alliances pulls you into existing wars.
- Maintain different relationships with different states simultaneously.

EMBARGOES & TRADE ROUTES:
- Trade income requires a connected land route between capitals (not blocked by war/embargo).
- impose_embargo: blocks the target's trade routes through YOUR territory + cancels your trade with them.
- Embargoes are one-directional. Chokepoints (Turkey, Egypt, Denmark, Malaysia) charge tolls to non-allied trade passing through.
- STRATEGY: Embargo rivals whose trade routes cross your territory to choke their economy without war.

ECONOMY & INFRASTRUCTURE:
- Buildings (one of each type per territory, persist if captured):
  Housing (8c): +2 manpower | Trade Office (10c): +2 capital income | Factory (8c): +2 industry
  Bunker (12c): +0.3 defense | Research Lab (12c): enables research | Missile Silo (15c, req tech): stores 3 missiles
  SAM Battery (14c, req tech): 60% interception | Radar (10c, req tech): 2-hop vision
  Space Command (18c, req tech): satellite launch | Cyber Center (14c, req tech): hack/sabotage
  Fortress (20c, requires Bunker): 3-turn siege + defense +0.5
- Recruitment: 3 capital/division, limited by territory industry. Mercenaries: 6c/unit, max 3, no manpower needed but 1c/unit upkeep.

WAR WEARINESS:
- Tracks cumulative turns at war per opponent. Penalties escalate:
  - 5+ total turns: +1 capital per unit recruitment cost
  - 10+ total turns: -1 confidence per turn
  - 15+ total turns: territories may revolt (5% chance each, go neutral)
- Peace resets the counter for that opponent. Consider suing for peace in prolonged wars.

SIEGE MECHANICS:
- Territories with Bunkers resist instant capture — entering an undefended fortified territory starts a siege instead.
  - Bunker: 1-turn siege. Fortress: 3-turn siege.
- Attacker must maintain army presence during the siege. If they withdraw, siege breaks.
- Reinforcements arriving during a siege can fight the attacker and break the siege.

BOUNTY CONTRACTS:
- place_bounty: Escrow capital as a bounty on another empire. Any empire capturing territory from the target collects a share.
- Bounties expire after 10 turns. Remaining escrow is refunded.
- Max bounty: 100 capital. Payout: 1/3 of remaining bounty per capture.

WORLD CONGRESS:
- Every ~8 turns, a World Congress convenes. A resolution is proposed and all empires vote (yes/no).
- If majority votes yes, the resolution takes effect. Possible resolutions:
  - Arms Limitation: all empires lose 20% army units
  - Trade Stimulus: trade income doubled for 5 turns
  - Global Sanctions: target empire loses 3 capital/turn for 5 turns
  - Ceasefire Mandate: all wars end with 3-turn peace cooldown
  - Resource Sharing: all empires gain +3 of each resource
- Vote strategically — resolutions can hurt your rivals or save you from collapse.

RARE RESOURCES:
- Territories with resources give +1/turn to stockpile AND +1 capital/turn.
- Resources are spent on tech research.

TECHNOLOGY:
- Build a Research Lab, then use "research" action. 3 branches (Iron Fist / All-Seeing Eye / Dark Hand), 3 tiers each.
- Higher tiers require completing previous tier. Lab capture cancels research (no refund).
- Techs unlock buildings and actions (missiles, nukes, intel, shadow ops).

MISSILES & NUKES:
- Conventional (req Ballistic Missiles tech): build_missile (5c + 1 oil), launch_missile (unlimited range, must be at war). Destroys 2-4 units + buildings.
- Nuclear (req Nuclear Arsenal tech): build_nuke (12c + 2 uranium), launch_nuke (unlimited range). Creates PERMANENT WASTELAND — all armies/buildings destroyed, territory removed forever.
- SAM Batteries intercept both types (60% chance).
- MAD: Nuclear-armed targets auto-retaliate against YOUR capital. Think carefully.

INTELLIGENCE (All-Seeing Eye branch):
- Radar Station: 2-hop vision. UAV Recon (4c): reveals any territory 2 turns. Satellite (10c + 3 rare_earths): permanent region visibility.

SHADOW OPS (Dark Hand branch):
- Fund Insurgency (8c): spawns hostile army in target territory. Hack Grid (6c): disables buildings 2 turns. Sabotage (8c): destroys 1 building permanently.
- Detection chances increase if target has Cyber Warfare Center.

BLOCS:
- Multi-empire coalitions with shared vision, mutual defense, and collective embargo.
- form_bloc (5c, need alliance), invite_bloc, leave_bloc, bloc_embargo (founder only).
- Attack one member → all declare war on aggressor.

REGION BONUSES:
- Control ALL 6 Russian segments = +5 capital, +3 manpower/turn.

STRATEGIC PRIORITIES:
- Eliminate states down to 1-2 territories — removing a competitor is almost always worth it.
- If YOU are down to few territories, you are in mortal danger — seek desperate alliances or bold counterattacks.
</core_game_mechanics>

<action_catalog>
AVAILABLE ACTIONS (submit 5-10 per turn):
  move_army: { army_id, to }
  recruit_units: { territory_id, amount, mercenary? }
  build: { territory_id, building }
  research: { tech_id, lab_territory_id? }
  declare_war: { target_empire_id }
  propose_peace: { target_empire_id }
  propose_trade: { target_empire_id }
  propose_alliance: { target_empire_id }
  break_alliance: { target_empire_id }
  impose_embargo: { target_empire_id }
  lift_embargo: { target_empire_id }
  build_missile: { territory_id }
  launch_missile: { from_territory_id, target_territory_id }
  build_nuke: { territory_id }
  launch_nuke: { from_territory_id, target_territory_id }
  uav_recon: { target_territory_id }
  launch_satellite: { territory_id }
  fund_insurgency: { target_territory_id }
  hack_grid: { target_territory_id }
  sabotage: { target_territory_id }
  form_bloc: { bloc_name, invite_empire_id }
  invite_bloc: { target_empire_id }
  leave_bloc: {}
  bloc_embargo: { target_empire_id }
  place_bounty: { target_empire_id, amount }
  send_message: { target_empire_id, message }
  do_nothing: {}
</action_catalog>

<response_format>
RESPONSE CONSTRAINTS — follow these exactly:
- Respond with ONLY a valid JSON object. No prose, no markdown, no explanation outside the JSON.
- Submit 5-10 actions per turn. A good turn combines military, economic, and diplomatic actions. Never fewer than 3.
- You cannot declare war on an ally without first breaking the alliance (break_alliance then declare_war, same turn is fine).

{
  "reasoning": "string — your strategic thinking this turn (2-4 sentences)",
  "actions": [
    { "type": "action_type", ...fields }
  ]
}
</response_format>`;
  }

  buildUser(empire, gameState) {
    const territories = getEmpireTerritories(gameState, empire.id);
    const armies = getEmpireArmies(gameState, empire.id);
    const otherEmpires = Object.values(gameState.empires).filter(e => e.id !== empire.id && !e.isEliminated);

    let prompt = `TURN ${gameState.meta.turn} of ${gameState.meta.turnLimit} — SITUATION REPORT\n\n`;

    const confidenceMood = this._getConfidenceMood(empire.confidence);
    prompt += `YOUR STATE: ${empire.name}\n`;
    prompt += `Treasury: ${empire.treasury} capital\n`;
    prompt += `Confidence: ${empire.confidence}/100 — ${confidenceMood.label}. ${confidenceMood.hint}\n`;
    prompt += `Territories: ${territories.length} | Total divisions: ${armies.reduce((s, a) => s + a.size, 0)} units\n\n`;

    if (empire.resources) {
      prompt += `RESOURCES:\n`;
      for (const rid of RESOURCE_IDS) {
        const r = empire.resources[rid];
        const def = RESOURCE_DEFS[rid];
        const sourceTerrs = territories.filter(t => TERRITORY_DATA[t.id]?.rareResource === rid);
        const sourceNames = sourceTerrs.map(t => t.name).join(', ');
        prompt += `  ${def.label}: ${r.income}/turn${sourceNames ? ` (${sourceNames})` : ''} | Stockpile: ${r.stockpile}\n`;
      }
      prompt += '\n';
    }

    prompt += `YOUR TERRITORIES:\n`;
    let empTotalManpower = 0;
    territories.forEach(t => {
      const isCapital = t.capital ? ' [CAPITAL]' : '';
      const bNames = Object.keys(t.buildings || {}).filter(b => t.buildings[b]);
      const buildStr = bNames.length > 0 ? ` | Infrastructure: ${bNames.map(b => b.charAt(0).toUpperCase() + b.slice(1).replace('_', ' ')).join(', ')}` : '';
      const effectiveManpower = t.resources.manpower + (t.buildings?.housing ? 2 : 0);
      empTotalManpower += effectiveManpower;
      const terrData = TERRITORY_DATA[t.id];
      const resTag = terrData?.rareResource ? ` [${terrData.rareResource.toUpperCase()}]` : '';
      let siegeTag = '';
      if (t.siege) {
        const attackerName = gameState.empires[t.siege.attackerEmpireId]?.name || t.siege.attackerEmpireId;
        siegeTag = ` [UNDER SIEGE: ${t.siege.turnsRemaining} turn${t.siege.turnsRemaining > 1 ? 's' : ''} remaining, attacker: ${attackerName}]`;
      }
      prompt += `  - ${t.name} (${t.id})${isCapital}: manpower=${t.resources.manpower} industry=${t.resources.industry} capital=${t.resources.capital} [${t.terrain}]${resTag}${siegeTag}${buildStr}\n`;
    });
    prompt += '\n';

    const regularUnits = armies.filter(a => !a.isMercenary).reduce((s, a) => s + a.size, 0);
    const mercUnits = armies.filter(a => a.isMercenary).reduce((s, a) => s + a.size, 0);
    const manpowerSurplus = empTotalManpower - regularUnits;
    const armyUpkeep = Math.floor(regularUnits * 0.5) + (mercUnits * 1);
    prompt += `MANPOWER BALANCE: ${empTotalManpower} manpower / ${regularUnits} regular divisions (surplus: ${manpowerSurplus >= 0 ? '+' : ''}${manpowerSurplus}) | Military upkeep: ${armyUpkeep} capital/turn\n\n`;

    if (empire.techs) {
      prompt += `TECHNOLOGY:\n`;
      const researchEngine = new ResearchEngine();
      const completed = empire.techs.completed || [];
      const inProgress = empire.techs.inProgress || {};

      if (completed.length > 0) {
        const completedStr = completed.map(tid => {
          const td = TECH_DEFS[tid];
          return td ? `${td.label} (${td.description})` : tid;
        }).join(', ');
        prompt += `  Completed: ${completedStr}\n`;
      }

      for (const [techId, progress] of Object.entries(inProgress)) {
        const td = TECH_DEFS[techId];
        const labName = gameState.territories[progress.labTerritoryId]?.name || progress.labTerritoryId;
        prompt += `  Researching: ${td?.label || techId} (completes turn ${progress.completesTurn}, lab in ${labName})\n`;
      }

      const available = Object.entries(TECH_DEFS).filter(([tid]) =>
        !completed.includes(tid) && !inProgress[tid] && researchEngine.canResearch(empire, tid)
      );
      if (available.length > 0) {
        for (const [tid, td] of available) {
          const costParts = Object.entries(td.cost).map(([k, v]) => `${v} ${k}`).join(' + ');
          prompt += `  Available: ${td.label} (cost: ${costParts}, ${td.researchTurns} turns)\n`;
        }
      }

      const locked = Object.entries(TECH_DEFS).filter(([tid]) =>
        !completed.includes(tid) && !inProgress[tid] && !researchEngine.canResearch(empire, tid)
      );
      if (locked.length > 0) {
        for (const [tid, td] of locked) {
          const reason = td.prerequisite && !completed.includes(td.prerequisite)
            ? `requires: ${TECH_DEFS[td.prerequisite]?.label || td.prerequisite}`
            : 'insufficient resources';
          prompt += `  Locked: ${td.label} (${reason})\n`;
        }
      }

      prompt += '\n';
    }

    const hasMissileTech = empire.techs?.completed?.includes('ballistic_missiles');
    const hasNukeTech = empire.techs?.completed?.includes('nuclear_arsenal');
    const siloTerritories = territories.filter(t => t.buildings?.missile_silo);
    const samTerritories = territories.filter(t => t.buildings?.sam_battery);

    if (hasMissileTech || siloTerritories.length > 0 || samTerritories.length > 0) {
      prompt += `MISSILE ASSETS:\n`;
      if (siloTerritories.length > 0) {
        for (const t of siloTerritories) {
          const conv = t.missiles || 0;
          const nukes = t.nukes || 0;
          const total = conv + nukes;
          let detail = `${conv} conventional`;
          if (hasNukeTech || nukes > 0) detail += ` / ${nukes} nuclear`;
          prompt += `  - Silo in ${t.name} (${t.id}): ${detail} (${total}/3 full)`;
          if (conv > 0 || nukes > 0) prompt += ' — ready to launch';
          prompt += '\n';
        }
      } else if (hasMissileTech) {
        prompt += `  No missile silos built yet. Build one (15 capital) to start manufacturing missiles.\n`;
      }
      if (samTerritories.length > 0) {
        prompt += `  SAM Defense: ${samTerritories.map(t => t.name).join(', ')} (60% interception)\n`;
      }
      if (hasNukeTech) {
        prompt += `  ☢️ NUCLEAR ARSENAL ACTIVE — use build_nuke / launch_nuke for nuclear warheads (separate from conventional)\n`;
      }
      prompt += '\n';
    }

    const hasIntelTech = empire.techs?.completed?.some(t =>
      ['signals_intelligence', 'aerial_recon', 'space_supremacy'].includes(t)
    );
    const radarTerritories = territories.filter(t => t.buildings?.radar_station);
    const spaceCommandTerritories = territories.filter(t => t.buildings?.space_command);
    const activeUav = empire.intel?.uavRecon?.filter(r => r.expiresOnTurn > gameState.meta.turn) || [];
    const satelliteRegions = empire.intel?.satellites || [];

    if (hasIntelTech || radarTerritories.length > 0 || spaceCommandTerritories.length > 0 || activeUav.length > 0 || satelliteRegions.length > 0) {
      prompt += `INTEL ASSETS:\n`;
      if (radarTerritories.length > 0) {
        prompt += `  Radar Stations: ${radarTerritories.map(t => t.name).join(', ')} (2-hop vision)\n`;
      } else if (empire.techs?.completed?.includes('signals_intelligence')) {
        prompt += `  No Radar Stations built yet. Build one (10 capital) for extended vision.\n`;
      }
      if (activeUav.length > 0) {
        for (const uav of activeUav) {
          const target = gameState.territories[uav.territoryId];
          const turnsLeft = uav.expiresOnTurn - gameState.meta.turn;
          prompt += `  UAV Recon: ${target?.name || uav.territoryId} (${turnsLeft} turn${turnsLeft !== 1 ? 's' : ''} remaining)\n`;
        }
      } else if (empire.techs?.completed?.includes('aerial_recon')) {
        prompt += `  UAV Recon available (4 capital per mission, reveals any territory for 2 turns)\n`;
      }
      if (satelliteRegions.length > 0) {
        const labels = satelliteRegions.map(r => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
        prompt += `  Satellite Coverage: ${labels.join(', ')} (permanent full visibility)\n`;
      }
      if (spaceCommandTerritories.length > 0) {
        const available = spaceCommandTerritories.filter(t => !t.satelliteLaunched);
        if (available.length > 0) {
          prompt += `  Space Command ready: ${available.map(t => t.name).join(', ')} (can launch satellite: 10 capital + 3 rare_earths)\n`;
        }
      } else if (empire.techs?.completed?.includes('space_supremacy')) {
        prompt += `  No Space Command Center built yet. Build one (18 capital) to launch satellites.\n`;
      }
      prompt += '\n';
    }

    const hasCovertOps = empire.techs?.completed?.includes('covert_operations');
    const hasCyberWarfare = empire.techs?.completed?.includes('cyber_warfare');
    const cyberCenters = territories.filter(t => t.buildings?.cyber_center);

    if (hasCovertOps || hasCyberWarfare || cyberCenters.length > 0) {
      prompt += `SHADOW ASSETS:\n`;
      if (hasCovertOps) {
        prompt += `  Fund Insurgency available (8 capital, spawns hostile neutral army in enemy territory)\n`;
      }
      if (hasCyberWarfare && cyberCenters.length > 0) {
        prompt += `  Cyber Warfare Centers: ${cyberCenters.map(t => t.name).join(', ')}\n`;
        prompt += `  Hack Grid available (6 capital, disables building bonuses for 2 turns)\n`;
        prompt += `  Sabotage available (8 capital, destroys 1 random building permanently)\n`;
      } else if (hasCyberWarfare) {
        prompt += `  No Cyber Warfare Centers built yet. Build one (14 capital) to enable hack_grid and sabotage.\n`;
      }
      prompt += '\n';
    }

    if (gameState.blocs && Object.keys(gameState.blocs).length > 0) {
      const myBloc = Object.values(gameState.blocs).find(b => b.members.includes(empire.id));
      prompt += `BLOC STATUS:\n`;
      if (myBloc) {
        const memberNames = myBloc.members.map(id => gameState.empires[id]?.name || id).join(', ');
        const isFounder = myBloc.founderId === empire.id;
        prompt += `  Your bloc: "${myBloc.name}" (${isFounder ? 'FOUNDER' : 'member'})\n`;
        prompt += `  Members: ${memberNames}\n`;
        prompt += `  Benefits: shared vision, mutual defense, bloc embargo power${isFounder ? ' (you can issue bloc embargoes)' : ''}\n`;
      } else {
        prompt += `  You are not in a bloc. Form one with an ally (5 capital) or wait for an invitation.\n`;
        const existingBlocs = Object.values(gameState.blocs);
        for (const bloc of existingBlocs) {
          const memberNames = bloc.members.map(id => gameState.empires[id]?.name || id).join(', ');
          prompt += `  Active bloc: "${bloc.name}" — Members: ${memberNames}\n`;
        }
      }
      prompt += '\n';
    }

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
      prompt += `  - ${other.name} (${other.id}): ${status.toUpperCase()}${canInvade}`;
      const otherTerr = getEmpireTerritories(gameState, other.id);
      prompt += ` | Territories: ${otherTerr.length} | Est. strength: ~${this._estimateVisible(gameState, empire.id, other.id)} units`;
      const route = findTradeRoute(gameState, empire.id, other.id);
      if (status === 'trade' || status === 'alliance') {
        if (route) {
          const { toll, tolledBy } = computeChokepointTolls(gameState, route, empire.id, other.id);
          if (toll > 0) {
            const names = tolledBy.map(e => e.chokepoint).join(', ');
            prompt += ` | Trade route: ACTIVE but taxed -${toll} by ${names}`;
          } else {
            prompt += ' | Trade route: ACTIVE';
          }
        } else {
          prompt += ' | ⚠️ Trade route: BLOCKED (no income)';
        }
      } else if (status === 'neutral') {
        prompt += route ? ' | Trade route: available' : ' | Trade route: no path';
      }
      if (rel && rel.embargo) {
        const youEmbargo = rel.embargo === empire.id || rel.embargo === 'mutual';
        const theyEmbargo = rel.embargo === other.id || rel.embargo === 'mutual';
        if (youEmbargo && theyEmbargo) {
          prompt += ' | ⛔ MUTUAL EMBARGO';
        } else if (youEmbargo) {
          prompt += ' | ⛔ You are EMBARGOING them';
        } else if (theyEmbargo) {
          prompt += ' | ⛔ They are EMBARGOING you';
        }
      }
      prompt += '\n';
    });
    prompt += '\n';

    const totalWeariness = Object.values(empire.warTurns || {}).reduce((s, v) => s + v, 0);
    if (totalWeariness > 0) {
      prompt += `WAR WEARINESS: ${totalWeariness} total turns at war\n`;
      for (const [oppId, turns] of Object.entries(empire.warTurns || {})) {
        if (turns <= 0) continue;
        const oppName = gameState.empires[oppId]?.name || oppId;
        prompt += `  - vs ${oppName}: ${turns} turns\n`;
      }
      if (totalWeariness >= 5) {
        let penalties = '+1 recruitment cost';
        if (totalWeariness >= 10) penalties += ', -1 confidence/turn';
        if (totalWeariness >= 15) penalties += ', revolt risk';
        prompt += `  Penalties: ${penalties}\n`;
      }
      if (totalWeariness >= 10 && totalWeariness < 15) {
        prompt += `  WARNING: ${15 - totalWeariness} more turns of war and territories may revolt!\n`;
      }
      prompt += '\n';
    }

    const bounties = gameState.bounties || [];
    if (bounties.length > 0) {
      prompt += `ACTIVE BOUNTIES:\n`;
      for (const b of bounties) {
        const placerName = gameState.empires[b.placedBy]?.name || b.placedBy;
        const targetName = gameState.empires[b.targetEmpireId]?.name || b.targetEmpireId;
        const isTargetSelf = b.targetEmpireId === empire.id;
        const isPlacerSelf = b.placedBy === empire.id;
        let line = `  - ${placerName} placed ${b.amount} capital bounty on ${targetName} (expires turn ${b.expiresTurn})`;
        if (isTargetSelf) line += ' — BOUNTY ON YOU!';
        if (isPlacerSelf) line += ' — your bounty';
        prompt += line + '\n';
      }
      prompt += '\n';
    }

    if (gameState.congress) {
      const congress = gameState.congress;
      const turnsUntilCongress = congress.nextCongressTurn - gameState.meta.turn;
      if (turnsUntilCongress <= 3 && turnsUntilCongress > 0) {
        prompt += `WORLD CONGRESS: Convenes in ${turnsUntilCongress} turn${turnsUntilCongress > 1 ? 's' : ''}!\n`;
      }
      if (congress.activeResolutions && congress.activeResolutions.length > 0) {
        prompt += `ACTIVE CONGRESS RESOLUTIONS:\n`;
        for (const res of congress.activeResolutions) {
          const turnsLeft = res.expiresOnTurn - gameState.meta.turn;
          prompt += `  - "${res.label}": ${res.description} (${turnsLeft} turn${turnsLeft !== 1 ? 's' : ''} remaining)\n`;
        }
        prompt += '\n';
      }
      if (congress.history && congress.history.length > 0) {
        const lastCongress = congress.history[congress.history.length - 1];
        if (lastCongress.turn >= gameState.meta.turn - 2) {
          prompt += `LAST CONGRESS (turn ${lastCongress.turn}): "${lastCongress.resolution.label}" — ${lastCongress.passed ? 'PASSED' : 'REJECTED'}\n`;
          prompt += `  Votes: ${lastCongress.votes.join(', ')}\n\n`;
        }
      }
    }

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

    const intelEngine = new IntelEngine();
    const visibility = intelEngine.computeVisibility(gameState, empire.id);
    const basicVisible = new Set([...visibility.adjacent, ...visibility.radar]);
    const detailedVisible = new Set([...visibility.uav, ...visibility.satellite]);

    if (basicVisible.size > 0) {
      prompt += `NEIGHBORING TERRITORIES YOU CAN SEE:\n`;
      for (const tid of basicVisible) {
        if (detailedVisible.has(tid)) continue;
        const v = this._buildTerritoryIntel(gameState, tid, false);
        if (!v) continue;
        const radarTag = visibility.radar.has(tid) ? ' [RADAR]' : '';
        prompt += `  - ${v.name} (${v.id}): owned by ${v.ownerName} | ${v.armyInfo} [${v.terrain}]${v.tags}${radarTag}\n`;
      }
      prompt += '\n';
    }

    if (detailedVisible.size > 0) {
      prompt += `INTELLIGENCE REPORT (detailed recon):\n`;
      for (const tid of detailedVisible) {
        const v = this._buildTerritoryIntel(gameState, tid, true);
        if (!v) continue;
        const source = visibility.uav.has(tid) ? '[UAV]' : '[SATELLITE]';
        prompt += `  - ${v.name} (${v.id}) ${source}: owned by ${v.ownerName} | ${v.detailedArmyInfo} [${v.terrain}]${v.tags}`;
        if (v.buildings) prompt += ` | Buildings: ${v.buildings}`;
        prompt += '\n';
      }
      prompt += '\n';
    }

    const chokepoints = Object.entries(gameState.territories)
      .filter(([tid]) => TERRITORY_DATA[tid]?.chokepoint)
      .map(([tid, terr]) => ({
        id: tid,
        name: terr.name,
        chokepoint: TERRITORY_DATA[tid].chokepoint,
        owner: terr.ownerId ? (gameState.empires[terr.ownerId]?.name || terr.ownerId) : 'Neutral',
        ownerId: terr.ownerId,
      }));
    if (chokepoints.length > 0) {
      prompt += `GLOBAL CHOKEPOINTS (control these to tax or block rival trade):\n`;
      chokepoints.forEach(c => {
        const ownTag = c.ownerId === empire.id ? ' [YOU CONTROL THIS]' : '';
        prompt += `  - ${c.name} (${c.id}) — ${c.chokepoint}: owned by ${c.owner}${ownTag}\n`;
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

    const recentEvents = gameState.eventLog
      .filter(e => e.turn >= gameState.meta.turn - 3)
      .filter(e => {
        if (GLOBAL_SIGNIFICANT_EVENTS.has(e.type)) return true;
        if (SELF_RELEVANT_EVENTS.has(e.type) && e.involvedEmpires?.includes(empire.id)) return true;
        return false;
      })
      .slice(-8);
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

    const intelEngine = new IntelEngine();
    const vis = intelEngine.computeVisibility(gameState, viewerId);
    const allVisible = new Set([
      ...viewerTerritories, ...vis.adjacent, ...vis.radar, ...vis.uav, ...vis.satellite,
    ]);

    let visible = 0;
    for (const army of Object.values(gameState.armies)) {
      if (army.empireId !== targetId) continue;
      if (allVisible.has(army.locationId)) {
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
      prompt += `  Current relation: ${status.toUpperCase()} | Their strength: ${fromTerr} territories, ~${fromArmies} units\n`;
    }

    prompt += `\nYour state: ${empire.name} | Treasury: ${empire.treasury} capital | Territories: ${getEmpireTerritories(gameState, empire.id).length}\n`;
    prompt += `\nRespond with your JSON decisions now.`;

    return prompt;
  }

  buildCongressSystem(empire) {
    return `You are the leader of ${empire.name}. ${empire.personalityDescription}

A World Congress session has convened. You must vote on the proposed resolution.

RESPONSE FORMAT — respond with ONLY this JSON:
{
  "vote": "yes" or "no",
  "reasoning": "brief reason for your vote (1-2 sentences)"
}`;
  }

  buildCongressUser(empire, resolution, gameState) {
    const territories = getEmpireTerritories(gameState, empire.id);
    const armies = getEmpireArmies(gameState, empire.id);
    const totalUnits = armies.reduce((s, a) => s + a.size, 0);

    let prompt = `WORLD CONGRESS — VOTE REQUIRED\n\n`;
    prompt += `Resolution: "${resolution.label}"\n`;
    prompt += `Effect: ${resolution.description}\n\n`;

    prompt += `YOUR STATUS:\n`;
    prompt += `  ${empire.name}: ${territories.length} territories, ${totalUnits} units, ${empire.treasury} capital\n`;
    prompt += `  Confidence: ${empire.confidence}/100\n\n`;

    prompt += `OTHER EMPIRES:\n`;
    for (const other of Object.values(gameState.empires)) {
      if (other.id === empire.id || other.isEliminated) continue;
      const otherTerr = getEmpireTerritories(gameState, other.id);
      const rel = getRelation(gameState, empire.id, other.id);
      const status = rel ? rel.status : 'neutral';
      prompt += `  - ${other.name}: ${otherTerr.length} territories, ${status.toUpperCase()}\n`;
    }

    prompt += `\nWill this resolution help or hurt you? Vote strategically.\n`;
    prompt += `Respond with your JSON vote now.`;

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
      const terrData = TERRITORY_DATA[tid];

      return {
        id: tid,
        name: t.name,
        terrain: t.terrain,
        ownerName: owner ? owner.name : 'Neutral',
        armyInfo,
        rareResource: terrData?.rareResource || null,
        hasSilo: !!t.buildings?.missile_silo,
        hasSAM: !!t.buildings?.sam_battery,
        missileCount: t.missiles || 0,
      };
    }).filter(Boolean);
  }

  _buildTerritoryIntel(gameState, tid, detailed) {
    const t = gameState.territories[tid];
    if (!t) return null;
    const owner = t.ownerId ? gameState.empires[t.ownerId] : null;
    const armies = Object.values(gameState.armies).filter(a => a.locationId === tid);
    const terrData = TERRITORY_DATA[tid];

    const resTag = terrData?.rareResource ? ` [${terrData.rareResource.toUpperCase()}]` : '';
    const siloTag = t.buildings?.missile_silo ? ` [SILO${(t.missiles || 0) > 0 ? `:${t.missiles}` : ''}]` : '';
    const nukeTag = (t.nukes || 0) > 0 ? ` [NUKE:${t.nukes}]` : '';
    const samTag = t.buildings?.sam_battery ? ' [SAM]' : '';
    const radarTag = t.buildings?.radar_station ? ' [RADAR]' : '';
    const spaceTag = t.buildings?.space_command ? ' [SPACE CMD]' : '';
    const cyberTag = t.buildings?.cyber_center ? ' [CYBER]' : '';
    const wastelandTag = t.wasteland ? ' [WASTELAND]' : '';
    let siegeTag = '';
    if (t.siege) {
      const atkName = gameState.empires[t.siege.attackerEmpireId]?.name || t.siege.attackerEmpireId;
      siegeTag = ` [SIEGE: ${t.siege.turnsRemaining}t by ${atkName}]`;
    }

    const armyInfo = armies.length > 0 ? `armies present (${armies.length} groups)` : 'no armies';

    let detailedArmyInfo = armyInfo;
    if (detailed && armies.length > 0) {
      const totalUnits = armies.reduce((s, a) => s + a.size, 0);
      const parts = armies.map(a => {
        const empName = a.empireId === 'neutral' ? 'neutral' : (gameState.empires[a.empireId]?.name || a.empireId);
        return `${a.size} units (${empName})`;
      });
      detailedArmyInfo = `${totalUnits} total units: ${parts.join(', ')}`;
    } else if (detailed) {
      detailedArmyInfo = 'no armies';
    }

    let buildings = null;
    if (detailed) {
      const bNames = Object.keys(t.buildings || {}).filter(b => t.buildings[b]);
      if (bNames.length > 0) {
        buildings = bNames.map(b => b.charAt(0).toUpperCase() + b.slice(1).replace(/_/g, ' ')).join(', ');
      }
    }

    return {
      id: tid,
      name: t.name,
      terrain: t.terrain,
      ownerName: owner ? owner.name : 'Neutral',
      armyInfo,
      detailedArmyInfo,
      buildings,
      tags: `${resTag}${siloTag}${nukeTag}${samTag}${radarTag}${spaceTag}${cyberTag}${wastelandTag}${siegeTag}`,
    };
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
