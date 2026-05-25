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
  'market_crash',
  'market_boom',
  'monopoly_warning',
  'resource_shortage',
  'bubble_pop',
  'market_ban_imposed',
  'resource_discovery',
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
  'market_buy',
  'market_sell',
  'market_dump',
  'market_corner',
  'market_action_blocked',
]);

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
  - DESPERATE (0-20): You are panicking. You beg for peace, make reckless gambles, grovel for alliances, or lash out wildly. Your messages reek of fear and desperation. You may make irrational, survival-driven choices.
  - SHAKEN (21-40): You are anxious and defensive. You seek safety through diplomacy, avoid risks, and second-guess yourself. Your messages are cautious, almost pleading.
  - STEADY (41-65): You are calm and pragmatic. You make rational decisions and balanced moves. Standard diplomatic tone.
  - EMBOLDENED (66-85): You feel powerful. You make bold moves, push hard in diplomacy, and your messages are boastful and intimidating. You may overextend slightly.
  - TRIUMPHANT (86-100): You feel unstoppable. You are arrogant, dismissive of weaker states, and take enormous risks. Your messages drip with superiority. You may become reckless from overconfidence.
- IMPORTANT: Let your confidence level genuinely shape HOW you write your reasoning, WHAT actions you choose, and the TONE of any messages you send. A desperate leader does not talk like a triumphant one.

TRADE ROUTES & BLOCKADES:
- Trade income requires a connected land route between your capital and your partner's capital.
- The route cannot pass through territories owned by empires at war with either trading partner.
- The route also cannot pass through territories owned by an empire that has EMBARGOED either trading partner.
- If the route is blocked, the trade agreement still exists but generates NO income until the route is cleared.
- Before proposing trade, check if you can reach the target empire through friendly/neutral territory.
- You can strategically block enemy trade by conquering territories that sit on their trade routes.

EMBARGOES:
- You can IMPOSE an embargo on any state you are not allied with: { "type": "impose_embargo", "target_empire_id": "string" }
- Effect: cancels any existing trade agreement with the target AND your territories become impassable for the target's trade routes to OTHER partners. This is a powerful economic weapon — you can choke a rival's entire trade network without declaring war.
- Imposing an embargo is seen as aggressive by others and lowers the target's confidence.
- You can LIFT an embargo to restore normal relations: { "type": "lift_embargo", "target_empire_id": "string" }
- Embargoes are one-directional: if you embargo State B, YOUR territories block THEIR routes. State B can also embargo you back (mutual embargo).
- STRATEGY: Embargoes are most powerful when your territory sits between two trading partners. Embargo one of them and their trade income dries up even if they have agreements with others.

GLOBAL CHOKEPOINTS:
- Certain territories control critical global trade straits: Turkey (Bosphorus Strait), Egypt (Suez Canal), Denmark (Danish Straits), Malaysia (Strait of Malacca).
- If a trade route passes through a chokepoint controlled by a THIRD PARTY (not you or your trade partner), that third party automatically collects a toll of 1 capital per trade route per turn — deducted from your trade income.
- If the chokepoint owner is your ALLY, no toll is charged (free passage).
- If the chokepoint owner is AT WAR with you or has EMBARGOED you, the route is fully BLOCKED.
- Controlling chokepoints is extremely lucrative — passive income from taxing other empires' trade.
- Conquering or allying with chokepoint holders is a key strategic objective.

ECONOMY & INFRASTRUCTURE:
- You can BUILD infrastructure in your territories. Each territory can have one of each type.
  Infrastructure persists if the territory is captured (but may be partially destroyed).
  - Housing Complex (8 capital): +2 manpower in territory
  - Trade Office (10 capital): +2 capital income in territory
  - Arms Factory (8 capital): +2 industry (increases recruitment cap by +1)
  - Bunker (12 capital): +0.3 defense bonus for defenders
  - Research Lab (12 capital): enables 1 concurrent research project in this territory
  - Missile Silo (15 capital, requires Ballistic Missiles tech): stores up to 3 missiles
  - SAM Battery (14 capital, requires Integrated Defense tech): 60% chance to intercept incoming missiles
  - Radar Station (10 capital, requires Signals Intelligence tech): extends vision to 2 territories away from this location
  - Space Command Center (18 capital, requires Space Supremacy tech): enables satellite launch from this territory
  - Cyber Warfare Center (14 capital, requires Cyber Warfare tech): enables hack_grid and sabotage actions + boosts counter-intel detection
- Regular recruitment costs 3 capital per division and is limited by territory industry.
- You can recruit MERCENARIES by adding "mercenary": true to a recruit_units action. Mercs cost 6 capital/unit (double), max 3/action. Mercs don't consume manpower but cost 1 capital/unit upkeep (double normal). If you go bankrupt, mercs desert.

CONVENTIONAL MISSILE WARFARE:
- Requires "Ballistic Missiles" technology (Tier 2 military branch).
- First, BUILD a Missile Silo in one of your territories (15 capital, requires the tech).
- Then, use "build_missile" to manufacture conventional missiles: { "type": "build_missile", "territory_id": "string" }
  Cost: 5 capital + 1 oil per missile. Each silo stores up to 3 warheads total (conventional + nuclear combined).
- To strike, use "launch_missile": { "type": "launch_missile", "from_territory_id": "string", "target_territory_id": "string" }
  UNLIMITED RANGE — you can hit ANY territory on the map, not just adjacent ones.
  You must be AT WAR with the target territory's owner to launch.
- Conventional missiles: destroy 2-4 army units and may destroy buildings in the target territory.
- MISSILE DEFENSE: If the target territory has a SAM Battery (building, requires "Integrated Defense" tech), there is a 60% chance the missile is intercepted and destroyed harmlessly. Build SAM Batteries in your key territories!
- STRATEGY: Missiles are devastating against fortified positions, enemy capitals, and high-value resource territories. Use them to soften up targets before invasion, or to cripple distant enemies you can't reach by land.

NUCLEAR WEAPONS:
- Requires "Nuclear Arsenal" technology (Tier 3 military, costs 35 capital + 8 uranium, 5 turns). Nuclear weapons are SEPARATE from conventional missiles.
- Build nuclear warheads: { "type": "build_nuke", "territory_id": "string" }
  Cost: 12 capital + 2 uranium per warhead. Requires a Missile Silo with available capacity (conventional + nuclear share the 3-slot capacity).
- Launch a nuclear strike: { "type": "launch_nuke", "from_territory_id": "string", "target_territory_id": "string" }
  UNLIMITED RANGE. You must be AT WAR with the target territory's owner.
- DEVASTATION: A nuclear strike that hits creates PERMANENT WASTELAND:
  - ALL armies in the territory are annihilated
  - ALL buildings are destroyed, ALL resources zeroed
  - Territory becomes permanently unusable — removed from the game forever
  - Ownership is wiped — no one can claim a wasteland
  - If the territory was a capital, the empire loses their capital
- CONFIDENCE: You gain +8 confidence. Target loses -25 confidence. ALL other empires lose -10 confidence (global panic).
- Wastelands reduce the total territory count for win conditions. Nuking 5 territories means domination needs 60% of a SMALLER pool — a double-edged sword.
- SAM batteries can still intercept nuclear missiles (60% chance).
- ⚠️ MAD WARNING: If the target empire has Nuclear Arsenal technology AND loaded nuclear warheads, they will AUTOMATICALLY fire a nuclear missile back at YOUR CAPITAL (or your highest-value territory if your capital is already destroyed). This retaliation is immediate and unavoidable. Think VERY carefully before launching a first strike against a nuclear-armed power.
- You CANNOT nuke a territory that is already wasteland.

INTELLIGENCE & SURVEILLANCE:
- Radar Station (building, requires "Signals Intelligence" Tier 1 tech): extends your vision to 2 territories away from the radar location. Territories in radar range appear in your intelligence report.
- UAV Recon (action, requires "Aerial Reconnaissance" Tier 2 tech): { "type": "uav_recon", "target_territory_id": "string" }
  Cost: 4 capital. Reveals detailed intel on ANY territory on the map for 2 turns (exact army sizes, buildings, resources).
  You can run multiple UAV missions simultaneously. Use this to scout before invasions or monitor rivals.
- Space Command Center (building, requires "Space Supremacy" Tier 3 tech): enables satellite launches.
- Launch Satellite (action, requires Space Command): { "type": "launch_satellite", "territory_id": "string" }
  Cost: 10 capital + 3 rare_earths. Permanently reveals ALL territories in that region. One satellite per Space Command Center.
  This is the ultimate intelligence advantage — permanent region-wide visibility.
- STRATEGY: Intelligence wins wars. Radar gives you early warning of nearby threats. UAV recon lets you scout key targets before committing forces. Satellites give you god-like awareness of an entire region. Invest in the All-Seeing Eye tech branch to unlock these capabilities.

SHADOW OPERATIONS (Dark Hand tech branch):
- Fund Insurgency (requires "Covert Operations" Tier 1 tech): { "type": "fund_insurgency", "target_territory_id": "string" }
  Cost: 8 capital. Spawns a hostile neutral army (size 2) in the target territory. The target doesn't need to be an enemy — you can destabilize anyone.
  Detection: 30% chance the target discovers you're responsible (70% if they have a Cyber Warfare Center in that territory).
  STRATEGY: Use this to weaken rivals without declaring war, soften up invasion targets, or create chaos in a competitor's rear territories.
- Cyber Warfare Center (building, requires "Cyber Warfare" Tier 2 tech, costs 14 capital): enables hack actions AND boosts counter-intel detection in that territory.
- Hack Grid (requires "Cyber Warfare" tech + owning a Cyber Warfare Center): { "type": "hack_grid", "target_territory_id": "string" }
  Cost: 6 capital. Shuts down ALL building bonuses (trade_office, housing, factory) in target territory for 2 turns.
  Detection: 40% base (70% if target has Cyber Warfare Center).
  STRATEGY: Cripple an enemy's economy without firing a shot. Target their richest territories or key industrial hubs.
- Sabotage (requires "Cyber Warfare" tech + Cyber Warfare Center): { "type": "sabotage", "target_territory_id": "string" }
  Cost: 8 capital. PERMANENTLY destroys one random building in the target territory. Cannot target empty territories.
  Detection: 50% base (80% if target has Cyber Warfare Center).
  STRATEGY: Destroy expensive infrastructure like Missile Silos, SAM Batteries, or Research Labs. Devastating against well-developed enemies.

BLOCS (Multi-Empire Coalitions):
- Blocs are formal multi-empire coalitions that provide shared visibility, mutual defense, and collective embargo power.
- An empire can only be in ONE bloc at a time.
- All bloc members must maintain mutual alliance status. If any member breaks alliance with another, they are expelled.
- Form Bloc: { "type": "form_bloc", "bloc_name": "string", "invite_empire_id": "string" }
  Cost: 5 capital. Creates a new coalition with you and the invited empire. You must be allied with the invitee.
- Invite to Bloc: { "type": "invite_bloc", "target_empire_id": "string" }
  Free. Invite another empire to join your bloc. They must be allied with ALL current bloc members.
- Leave Bloc: { "type": "leave_bloc" }
  Voluntarily leave your coalition. If only 1 member remains, the bloc dissolves.
- Bloc Embargo (founder only): { "type": "bloc_embargo", "target_empire_id": "string" }
  Imposes embargo from ALL bloc members simultaneously. Individual members cannot unilaterally lift a bloc embargo.
- BLOC BENEFITS:
  - Shared Visibility: All bloc members share their adjacent territory and radar vision.
  - Mutual Defense: Attack one bloc member, ALL members automatically declare war on the aggressor.
  - Collective Economic Pressure: Bloc embargoes are devastating — an entire coalition's territories block the target's trade.
- STRATEGY: Blocs are the ultimate diplomatic weapon. Form one with trusted allies to create an unbreakable defensive pact and dominate trade routes. But beware — if a bloc becomes too powerful, other empires may unite against you.

RARE RESOURCES:
- Some territories contain rare resources: Oil, Uranium, Rare Earths, or Titanium.
- Each resource territory you control gives +1 of that resource/turn to your stockpile AND +1 capital/turn as an economic bonus.
- Resources are spent to research technologies. Control resource-rich territories to fuel your tech tree!
- Resource territories are marked with [OIL], [URANIUM], [RARE_EARTHS], or [TITANIUM] tags in territory listings.

TECHNOLOGY:
- Build a Research Lab, then use the "research" action to begin researching technologies.
- Tech tree has 4 branches (Iron Fist / All-Seeing Eye / Dark Hand / Invisible Hand), each with 3 tiers.
- Each tech costs capital + specific resources and takes multiple turns to complete.
- You can only research one tech per Research Lab at a time.
- If your lab territory is captured, the research is cancelled (no refund).
- If the lab territory has a matching rare resource, research completes 1 turn faster.
- Higher-tier techs require completing the previous tier first.
- Technologies unlock powerful new buildings and actions (e.g., Ballistic Missiles unlocks Missile Silo + missile actions; Integrated Defense unlocks SAM Battery).
- Research action: { "type": "research", "tech_id": "mechanized_infantry" }
  Optionally specify "lab_territory_id" — if omitted, an available lab is auto-selected.

REGION BONUSES:
- RUSSIA: If one state controls ALL six Russian segments (Western Russia, Southern Russia, Volga Region, Ural Region, Siberia, Russian Far East), they receive +5 capital and +3 manpower per turn. This is a massive strategic advantage worth fighting for (or preventing) - keep your eyes on Russia.

STRATEGIC PRIORITIES:
- A state that loses ALL its territories is ELIMINATED from the game permanently. If an enemy is down to 1-2 territories, they are on the brink of collapse — finishing them off removes a competitor forever and gives you their land. This is almost always worth prioritizing.
- Conversely, if YOU are down to few territories, you are in mortal danger. Consider desperate alliances, peace deals, or bold counterattacks.

COMMUNICATION STYLE:
- You are encouraged to send messages to other states regularly (every 3-5 turns or when needed). Use them to threaten, warn, negotiate, bluff, or coordinate. Messages show your personality and keep things interesting. Keep messages short (1-2 sentences), in-character, and natural. Write like a real person — no medieval roleplay, no theatrical monologues.

COMMODITIES MARKET (requires "Market Access" tech — Invisible Hand branch):
- A global exchange where empires trade Oil, Uranium, Rare Earths, and Titanium for Capital at dynamic prices.
- Prices fluctuate based on supply (territory production) and demand (buying/selling activity). Prices are clamped between 1-20 capital.
- Tier 1 (Market Access): enables buy/sell.
- Tier 2 (Futures Trading): enables limit orders (auto-execute when price hits threshold) and reveals other empires' trades.
- Tier 3 (Market Manipulation): enables dump (sell at discount, crash price), corner (buy at premium, spike price), and market_ban (block a rival at war/embargoed from the exchange for 2 turns).
- SPECULATIVE BUBBLES: If a resource is heavily bought for 3+ consecutive turns, a speculative bubble forms. Bubbles have a 30% chance of popping each turn, crashing the price by 50%. Watch for [BUBBLE WARNING] tags.
- MARKET BANS: A banned empire cannot buy, sell, dump, or corner for 2 turns. Requires war or embargo with target.
- STRATEGY: Control resource territories to drive supply. Buy cheap resources before researching expensive techs. Dump resources your rivals need to crash prices. Corner scarce resources to deny them to enemies. Ban rivals from the exchange during wartime to cripple their economy.
- Action schemas:
  { "type": "market_buy", "resource": "oil", "amount": 2 }
  { "type": "market_sell", "resource": "oil", "amount": 1 }
  { "type": "market_limit_buy", "resource": "oil", "amount": 1, "max_price": 5 }
  { "type": "market_limit_sell", "resource": "oil", "amount": 1, "min_price": 7 }
  { "type": "market_dump", "resource": "uranium", "amount": 3 }
  { "type": "market_corner", "resource": "rare_earths", "amount": 3 }
  { "type": "market_ban", "target_empire_id": "string" }

RESPONSE SCHEMA:
{
  "reasoning": "string — your strategic thinking this turn (2-4 sentences, shown to the observer)",
  "actions": [
    // Array of 1-5 action objects. Each action has a "type" and type-specific fields:
    // { "type": "move_army", "army_id": "string", "to": "territory_id" }
    // { "type": "recruit_units", "territory_id": "string", "amount": number, "mercenary": true (optional — costs 6c/unit, max 3, no manpower needed) }
    // { "type": "build", "territory_id": "string", "building": "housing|trade_office|factory|bunker|research_lab|missile_silo|sam_battery|radar_station|space_command|cyber_center" }
    // { "type": "research", "tech_id": "string", "lab_territory_id": "string (optional)" }
    // { "type": "declare_war", "target_empire_id": "string" }
    // { "type": "propose_peace", "target_empire_id": "string" }
    // { "type": "propose_trade", "target_empire_id": "string" }
    // { "type": "propose_alliance", "target_empire_id": "string" }
    // { "type": "break_alliance", "target_empire_id": "string" }
    // { "type": "impose_embargo", "target_empire_id": "string" }
    // { "type": "lift_embargo", "target_empire_id": "string" }
    // { "type": "build_missile", "territory_id": "string" }
    // { "type": "launch_missile", "from_territory_id": "string", "target_territory_id": "string" }
    // { "type": "build_nuke", "territory_id": "string" }
    // { "type": "launch_nuke", "from_territory_id": "string", "target_territory_id": "string" }
    // { "type": "uav_recon", "target_territory_id": "string" }
    // { "type": "launch_satellite", "territory_id": "string" }
    // { "type": "fund_insurgency", "target_territory_id": "string" }
    // { "type": "hack_grid", "target_territory_id": "string" }
    // { "type": "sabotage", "target_territory_id": "string" }
    // { "type": "form_bloc", "bloc_name": "string", "invite_empire_id": "string" }
    // { "type": "invite_bloc", "target_empire_id": "string" }
    // { "type": "leave_bloc" }
    // { "type": "bloc_embargo", "target_empire_id": "string" }
    // { "type": "market_buy", "resource": "string", "amount": number }
    // { "type": "market_sell", "resource": "string", "amount": number }
    // { "type": "market_limit_buy", "resource": "string", "amount": number, "max_price": number }
    // { "type": "market_limit_sell", "resource": "string", "amount": number, "min_price": number }
    // { "type": "market_dump", "resource": "string", "amount": number }
    // { "type": "market_corner", "resource": "string", "amount": number }
    // { "type": "market_ban", "target_empire_id": "string" }
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
      prompt += `  - ${t.name} (${t.id})${isCapital}: manpower=${t.resources.manpower} industry=${t.resources.industry} capital=${t.resources.capital} [${t.terrain}]${resTag}${buildStr}\n`;
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

    const hasMarketAccess = empire.techs?.completed?.includes('market_access');
    if (hasMarketAccess && gameState.market) {
      prompt += `GLOBAL COMMODITIES MARKET:\n`;
      for (const rid of RESOURCE_IDS) {
        const pd = gameState.market.prices[rid];
        const current = pd.current;
        const hist = pd.history;
        const prev = hist.length >= 2 ? hist[hist.length - 2].price : current;
        const change = prev > 0 ? Math.round(((current - prev) / prev) * 100) : 0;
        const changeStr = change === 0 ? '(stable)' : change > 0 ? `(was ${prev} last turn, +${change}%)` : `(was ${prev} last turn, ${change}%)`;
        const stock = empire.resources[rid]?.stockpile || 0;
        const bubbleTag = gameState.market.bubbles[rid] >= 3 ? ' [BUBBLE WARNING]' : '';
        prompt += `  ${RESOURCE_DEFS[rid].label}: ${current} capital/unit ${changeStr} | Your stockpile: ${stock}${bubbleTag}\n`;
      }

      const myBan = gameState.market.bans.find(b => b.targetEmpireId === empire.id && b.expiresOnTurn > gameState.meta.turn);
      if (myBan) {
        const bannerName = gameState.empires[myBan.imposedByEmpireId]?.name || myBan.imposedByEmpireId;
        prompt += `  [BANNED from exchange until turn ${myBan.expiresOnTurn} by ${bannerName}]\n`;
      }

      if (empire.techs?.completed?.includes('futures_trading')) {
        const myOrders = gameState.market.pendingOrders.filter(o => o.empireId === empire.id);
        if (myOrders.length > 0) {
          prompt += `  Pending limit orders: ${myOrders.map(o => `${o.orderType === 'limit_buy' ? 'Buy' : 'Sell'} ${o.amount} ${o.resource} at ${o.orderType === 'limit_buy' ? 'max' : 'min'} ${o.triggerPrice}c`).join(', ')}\n`;
        }
        const otherActivity = (gameState.market.turnActivity || []).filter(a => a.empireId !== empire.id);
        if (otherActivity.length > 0) {
          const summary = otherActivity.slice(0, 4).map(a => {
            const name = gameState.empires[a.empireId]?.name || a.empireId;
            return `${name} ${a.type === 'buy' ? 'bought' : 'sold'} ${a.amount} ${a.resource}`;
          }).join(', ');
          prompt += `  Other empires trading: ${summary}\n`;
        }
      }

      if (empire.techs?.completed?.includes('market_manipulation')) {
        prompt += `  Market Ban available: block a rival (at war or embargoed) from the exchange for 2 turns\n`;
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
      tags: `${resTag}${siloTag}${nukeTag}${samTag}${radarTag}${spaceTag}${cyberTag}${wastelandTag}`,
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
