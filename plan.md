# LLM Empire Wars — Plan of Action

**Status:** Architecture & Design  
**Target:** Browser-only, Europe map, 3 AI empires via OpenRouter (deepseek/deepseek-v4-pro)  
**Paradigm:** Pure observer simulation, turn-based, persistence-ready

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Tech Stack](#2-tech-stack)
3. [Data Layer & State Architecture](#3-data-layer--state-architecture)
4. [Map System](#4-map-system)
5. [Game Engine](#5-game-engine)
6. [AI System](#6-ai-system)
7. [Interaction Systems](#7-interaction-systems)
8. [Overseer UI](#8-overseer-ui)
9. [Turn Loop](#9-turn-loop)
10. [File-by-File Build Order](#10-file-by-file-build-order)
11. [Open Questions & Future Work](#11-open-questions--future-work)

---

## 1. Project Structure

```
llm-empire-wars/
├── index.html                  # Entry point
├── style.css                   # Global styles, dark theme tokens
├── main.js                     # App bootstrap, wires everything together
│
├── data/
│   ├── europe.geojson          # Europe country borders (Natural Earth)
│   ├── provinces/              # Per-country province GeoJSON files (GADM L1)
│   │   ├── france.geojson
│   │   ├── germany.geojson
│   │   └── ...
│   ├── territories.js          # Static territory metadata (resources, terrain)
│   └── empires.js              # Empire definitions (name, color, personality)
│
├── engine/
│   ├── GameState.js            # State schema + constructor
│   ├── GameEngine.js           # Turn resolution, action validation, rules
│   ├── CombatResolver.js       # Battle calculations
│   ├── DiplomacyEngine.js      # Relation state machine
│   ├── EconomyEngine.js        # Resource production, trade, treasury
│   └── EventSystem.js          # Random world events
│
├── ai/
│   ├── AIController.js         # Orchestrates all empire AI calls per turn
│   ├── OpenRouterClient.js     # Fetch wrapper for OpenRouter API
│   ├── PromptBuilder.js        # Builds per-empire prompt from game state
│   └── ResponseParser.js       # Validates + parses AI JSON response
│
├── map/
│   ├── MapController.js        # Leaflet init, layer management
│   ├── TerritoryLayer.js       # GeoJSON overlay, coloring, click handlers
│   ├── ArmyLayer.js            # Army marker positions and movement lines
│   └── MapTheme.js             # Dark theme config, CartoDB tiles, color palette
│
└── ui/
    ├── OverseersPanel.js       # Main right-side panel controller
    ├── DiplomacyFeed.js        # Live message feed between empires
    ├── ReasoningLog.js         # AI thought bubbles per turn
    ├── EmpireStats.js          # Resource + territory leaderboard
    ├── EventLog.js             # Turn history feed
    └── TurnControls.js         # Pause, advance, speed slider
```

**Why this structure:**
Every directory is a clean domain. The engine never imports from `ui/` or `map/` — it only reads and writes `GameState`. This means persistence, replays, and headless testing can all be added without touching the engine.

---

## 2. Tech Stack

| Layer         | Choice                                                | Reason                                                                           |
| ------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Map rendering | **Leaflet.js 1.9**                                    | Mature, lightweight, excellent GeoJSON support, no API key                       |
| Map tiles     | **CartoDB Dark Matter**                               | Free, no key, beautiful dark theme, matches aesthetic                            |
| GeoJSON data  | **Natural Earth (countries) + GADM L1 (provinces)**   | Free, accurate, widely used                                                      |
| UI framework  | **Vanilla JS with ES modules**                        | Zero build step, runs directly in browser, avoids React overhead for a game loop |
| AI API        | **OpenRouter** (`deepseek/deepseek-v4-pro`)           | Single endpoint for multi-model future, cheap, reliable                          |
| State storage | **In-memory JS object** (persistence-ready interface) | See Section 3                                                                    |
| Styling       | **CSS custom properties + dark theme**                | One file, no framework needed                                                    |

**No bundler, no build step.** All files are native ES modules loaded via `<script type="module">`. This keeps the project approachable and eliminates toolchain complexity. A bundler (Vite) can be dropped in later without changing any code.

---

## 3. Data Layer & State Architecture

### 3.1 The GameState Object

This is the single source of truth. Everything that happens in the game is a transformation of this object. It is fully JSON-serializable at all times — no functions, no circular references, no DOM nodes inside state.

```js
// GameState schema
{
  meta: {
    gameId: "uuid-v4",            // For future persistence keying
    turn: 14,
    phase: "resolution",          // "ai_thinking" | "resolution" | "awaiting_advance"
    speed: "normal",              // "slow" | "normal" | "fast" | "paused"
    createdAt: "ISO timestamp",
    lastUpdatedAt: "ISO timestamp"
  },

  empires: {
    "empire_claude": {
      id: "empire_claude",
      name: "The Iron Throne",
      model: "deepseek/deepseek-v4-pro",
      personality: "aggressive_militarist",
      color: "#c0392b",
      treasury: 840,
      isEliminated: false
    },
    // ...
  },

  territories: {
    "france": {
      id: "france",
      name: "France",
      ownerId: "empire_claude",      // null = neutral
      capital: true,
      resources: { food: 3, production: 4, gold: 2 },
      terrain: "plains",
      isProvince: false,             // true when in province drill-down mode
      parentTerritory: null          // set when isProvince: true
    },
    // ...
  },

  armies: {
    "army_001": {
      id: "army_001",
      empireId: "empire_claude",
      locationId: "france",
      size: 5,
      movesRemaining: 1             // resets each turn
    },
    // ...
  },

  relations: {
    "empire_claude__empire_gemini": {
      empireA: "empire_claude",
      empireB: "empire_gemini",
      status: "war",               // "neutral" | "trade" | "alliance" | "war"
      pactExpiry: null,            // turn number when pact expires, or null
      tradeValue: 0
    },
    // ...
  },

  diplomacyQueue: [
    // Messages sent this turn, resolved next turn
    {
      id: "msg_uuid",
      fromEmpireId: "empire_claude",
      toEmpireId: "empire_gemini",
      type: "propose_trade",
      message: "I offer free passage through France in exchange for Rhine trade rights.",
      turn: 14,
      status: "pending"            // "pending" | "accepted" | "rejected" | "ignored"
    }
  ],

  pendingActions: {
    // Actions submitted by AI this turn, not yet resolved
    "empire_claude": [ ...actions ],
    "empire_gemini": [ ...actions ],
    "empire_gpt":    [ ...actions ]
  },

  turnHistory: [
    // Array of full GameState snapshots, one per resolved turn
    // Capped at last 50 turns in memory; older turns pruned (or persisted to storage)
    { turn: 13, snapshot: { ...fullState } }
  ],

  eventLog: [
    {
      turn: 14,
      type: "battle",
      description: "The Iron Throne defeated Gemini forces in Germany.",
      involvedEmpires: ["empire_claude", "empire_gemini"]
    }
  ],

  activeEvents: [
    // World events currently affecting the game
    {
      id: "event_uuid",
      type: "famine",
      affectedTerritoryId: "poland",
      effect: { production: -2 },
      expiresOnTurn: 16
    }
  ]
}
```

### 3.2 Persistence-Ready Interface

All reads/writes to persistent storage go through one module: `StorageAdapter.js` (to be created when persistence is needed). The rest of the code never calls `localStorage` directly.

```js
// StorageAdapter.js (stub for now, real implementation later)
export const StorageAdapter = {
  async save(gameState) {
    // Future: localStorage, IndexedDB, or POST to backend
    console.log('[StorageAdapter] save called — not yet implemented');
  },
  async load(gameId) {
    // Future: retrieve by gameId
    return null;
  },
  async listSaves() {
    return [];
  },
};
```

The `GameEngine` calls `StorageAdapter.save(newState)` at the end of every resolved turn. Adding real persistence later = just implement those three methods.

### 3.3 State Transitions

State is **never mutated**. The engine always produces a new state object:

```js
// GameEngine.js pattern
function resolveTurn(currentState, allEmpireActions) {
  const nextState = deepClone(currentState);
  // ... apply all actions to nextState ...
  nextState.meta.turn += 1;
  nextState.meta.lastUpdatedAt = new Date().toISOString();
  return nextState;
}
```

This makes the `turnHistory` array trivial to populate and makes replay/undo possible later.

---

## 4. Map System

### 4.1 Leaflet Setup

```js
// MapController.js
// Tile layer: CartoDB Dark Matter (free, no API key)
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

// Initial view: Europe
const EUROPE_VIEW = { center: [54, 15], zoom: 4 };
```

### 4.2 Two-Level Map Architecture

The map operates in two modes that can be toggled:

**World/Europe Mode** (default)

- One GeoJSON layer: `europe.geojson` with all countries
- Each country feature is colored by its owning empire
- Clicking a country with provinces opens Province Mode

**Province Mode** (drill-down)

- The main GeoJSON layer is replaced with `provinces/{country}.geojson`
- A "back to Europe" button returns to world mode
- Province territories have their own ownership, armies, and resources
- The game engine uses the same territory schema for both levels

This is enabled by the `isProvince` and `parentTerritory` fields in the territory schema. The engine is map-mode-agnostic — it just processes territories regardless of whether they're countries or provinces.

### 4.3 Territory Styling

```js
// TerritoryLayer.js
function getTerritoryStyle(feature, gameState) {
  const territory = gameState.territories[feature.properties.id];
  const empire = territory.ownerId ? gameState.empires[territory.ownerId] : null;

  return {
    fillColor: empire ? empire.color : '#2c2c2c', // dark gray for neutral
    fillOpacity: 0.6,
    color: '#1a1a2e', // dark border
    weight: 1.5,
    // Highlight on hover applied via separate event handlers
  };
}
```

### 4.4 Army Markers

Armies are rendered as SVG circle markers on the map, positioned at territory centroids. Each marker shows:

- Empire color ring
- Unit count number
- Animated pulse when moving this turn

Movement is shown as an animated dashed polyline from origin to destination, lasting ~1 second per move, triggered during the resolution phase.

---

## 5. Game Engine

### 5.1 CombatResolver.js

Combat happens when two or more empires have armies in the same territory at end of turn.

```
battle_score = army_size * terrain_modifier * random(0.75, 1.25)

terrain_modifiers:
  mountains:  defender +40%
  forest:     defender +20%
  plains:     no modifier
  coast:      no modifier
  capital:    defender +30%

Outcome:
  Winner = empire with higher battle_score
  Loser army size reduction = floor(winner_score * 0.4)
  Winner army size reduction = floor(loser_score * 0.3)
  Territory changes owner if defender is eliminated or retreats
  Army is destroyed if reduced to 0 units
```

Battles involving more than two empires resolve as a free-for-all: each pair fights, weakest eliminated first.

### 5.2 DiplomacyEngine.js

Diplomatic relations are a state machine per empire pair:

```
States: neutral → trade_agreement → alliance → war

Transitions:
  neutral     + propose_trade    → trade_agreement (if accepted)
  neutral     + declare_war      → war
  trade       + declare_war      → war (trade bonus lost immediately)
  trade       + propose_alliance → alliance (if accepted)
  alliance    + betray           → war (−reputation penalty applied)
  war         + propose_peace    → neutral (if accepted, 3-turn cooldown before war again)

Reputation score (per empire, 0–100):
  Breaking a pact:  −25
  Honoring a pact:  +5 per turn active
  Winning a war:    +10
  Backstabbing:     −30
  Other AIs factor reputation into whether they accept proposals
```

Diplomatic messages between AIs are queued in `diplomacyQueue`, delivered at the start of the next turn, and the receiving AI responds in their next action set.

### 5.3 EconomyEngine.js

Each territory produces resources every turn based on its static metadata plus active modifiers.

```
Per-turn income for an empire:
  gold_income = sum(territory.resources.gold) for all owned territories
              + sum(trade_agreement_value) for all active trade pacts
              - army_upkeep (0.5 gold per army unit per turn)

Resource types: food, production, gold
  food:        feeds armies (shortage = army attrition: −1 unit/turn per starving army)
  production:  used to recruit new units (cost: 2 production per unit)
  gold:        used for diplomacy, espionage, events

Army recruitment action:
  Cost: 2 production + 1 gold per unit
  Maximum per turn: territory.resources.production / 2 (rounded down)
  New armies spawn in owned territory
```

### 5.4 EventSystem.js

Each turn has a 20% chance of a random world event triggering. Events are weighted by game context (e.g. famines more likely in low-food territories).

| Event         | Effect                           | Duration                    |
| ------------- | -------------------------------- | --------------------------- |
| Famine        | −2 food in territory             | 2 turns                     |
| Plague        | −2 units from nearest army       | Instant                     |
| Gold Rush     | +5 gold to territory owner       | Instant                     |
| Rebellion     | Territory flips to neutral       | Permanent until reconquered |
| Storm         | All coastal armies −1 unit       | Instant                     |
| Spy Uncovered | Reveals that empire's spy action | Instant                     |

Events are surfaced to all AIs in their next turn's prompt so they can react to them.

---

## 6. AI System

### 6.1 OpenRouterClient.js

Single fetch wrapper. All AI calls go through here.

```js
// Config (set once at game start)
export const OpenRouterConfig = {
  apiKey: '', // User enters this in the setup screen
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'deepseek/deepseek-v4-pro',
  maxTokens: 800,
  temperature: 0.8, // Some variance for interesting decisions
};

export async function callAI(systemPrompt, userPrompt) {
  const response = await fetch(OpenRouterConfig.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OpenRouterConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OpenRouterConfig.model,
      max_tokens: OpenRouterConfig.maxTokens,
      temperature: OpenRouterConfig.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  // Error handling, rate limit detection, retry logic here
  return await response.json();
}
```

### 6.2 PromptBuilder.js

Builds two prompts per empire per turn: a **system prompt** (static personality) and a **user prompt** (current world state).

**System Prompt (set once per empire, never changes):**

```
You are the strategic leader of {empire.name}, an empire competing for dominance in Europe.

Your personality: {empire.personality_description}

CRITICAL RULES:
- You must respond ONLY with a valid JSON object. No prose, no markdown, no explanation outside the JSON.
- Your response schema is defined below. Any response not matching this schema will be rejected.
- You can submit 1–4 actions per turn.
- You cannot move armies to non-adjacent territories.
- You cannot declare war on an ally without first breaking the alliance.

RESPONSE SCHEMA:
{
  "reasoning": "string — your strategic thinking this turn (2–4 sentences, shown to the observer)",
  "actions": [ ...array of action objects, schema below... ]
}
```

**User Prompt (rebuilt every turn from GameState):**

```
TURN {N} — WORLD STATE

YOUR EMPIRE: {empire.name}
Treasury: {gold} gold | Armies: {army_count} units across {territory_count} territories
Territories: {list with resources}

YOUR ARMIES: {army_id, location, size for each}

DIPLOMATIC RELATIONS:
{for each empire: name, relation status, reputation score}

INCOMING MESSAGES THIS TURN:
{diplomacyQueue messages addressed to this empire}

NEIGHBORING TERRITORIES YOU CAN SEE:
{adjacent territories with owner and visible army sizes}

WORLD EVENTS THIS TURN:
{activeEvents descriptions}

RECENT HISTORY (last 3 turns):
{eventLog last 9 entries}

AVAILABLE ACTIONS:
[full action schema listed here]

Submit your JSON response now.
```

### 6.3 ResponseParser.js

The AI response is validated before being handed to the engine. Invalid responses get one retry with an error message appended to the prompt. If the second attempt also fails, that empire submits a null action (does nothing this turn) and an error is logged.

```js
// Action types and their required fields
const ACTION_SCHEMA = {
  move_army: { required: ['army_id', 'to'] },
  recruit_units: { required: ['territory_id', 'amount'] },
  declare_war: { required: ['target_empire_id'] },
  propose_peace: { required: ['target_empire_id'] },
  propose_trade: { required: ['target_empire_id'] },
  propose_alliance: { required: ['target_empire_id'] },
  break_alliance: { required: ['target_empire_id'] },
  send_message: { required: ['target_empire_id', 'message'] },
  espionage: { required: ['target_empire_id'] },
  do_nothing: { required: [] },
};
```

### 6.4 AIController.js

Orchestrates all empire AI calls per turn. Calls are sequential (not parallel) to keep reasoning logs readable and avoid overwhelming the API.

```
async function runAITurn(gameState):
  for each empire in gameState.empires (not eliminated):
    emit event: "ai_thinking_started" (empire_id)  → UI shows spinner for that empire
    systemPrompt = PromptBuilder.buildSystem(empire)
    userPrompt   = PromptBuilder.buildUser(empire, gameState)
    rawResponse  = await OpenRouterClient.callAI(systemPrompt, userPrompt)
    parsed       = ResponseParser.parse(rawResponse)
    gameState.pendingActions[empire.id] = parsed.actions
    emit event: "ai_thinking_done" (empire_id, parsed.reasoning)  → UI shows reasoning bubble
  return gameState  // with pendingActions populated
```

---

## 7. Interaction Systems

### 7.1 Action Resolution Order (within a turn)

Actions are resolved in this strict order to handle conflicts deterministically:

```
1. Diplomatic responses     (accept/reject proposals from last turn's queue)
2. Alliance breaks          (must happen before war declarations)
3. War declarations         (status updates before armies move)
4. Army recruitment         (new units placed before movement)
5. Army movement            (all moves resolved simultaneously)
6. Combat resolution        (battles at contested territories)
7. Trade income calculated  (after territory ownership confirmed)
8. Economy update           (treasury, resource stocks updated)
9. Active events resolved   (expiry, new events rolled)
10. Diplomatic messages queued (delivered next turn)
```

### 7.2 Adjacency Graph

Armies can only move to adjacent territories. A static adjacency map for European countries is defined in `territories.js`. Example:

```js
export const ADJACENCY = {
  france: ['spain', 'andorra', 'monaco', 'italy', 'switzerland', 'germany', 'luxembourg', 'belgium'],
  germany: ['france', 'luxembourg', 'belgium', 'netherlands', 'denmark', 'poland', 'czech_republic', 'austria', 'switzerland'],
  // ... full Europe graph
};
```

The prompt builder uses this to tell the AI which territories are valid move destinations for each army.

### 7.3 Fog of War Rules

What each empire can see in their prompt:

- **Full visibility:** all owned territories, all own armies
- **Partial visibility:** adjacent territory owner + army presence (size unknown)
- **Hidden:** non-adjacent territories (owner shown on map to observer, but not sent to AI)
- **Espionage action:** reveals exact army sizes in target empire's territories for 2 turns

This creates real information asymmetry and makes AI decisions genuinely uncertain.

### 7.4 Reputation System

Every empire has a `reputation` score (0–100, starts at 50). Other AIs are more likely to accept proposals from high-reputation empires. The prompt includes reputation scores.

```
Proposal acceptance logic (rough guideline for AI via prompt):
  reputation 80–100: proposals accepted ~80% of the time
  reputation 50–79:  proposals accepted ~50% of the time
  reputation 20–49:  proposals accepted ~25% of the time
  reputation 0–19:   proposals almost always rejected
```

---

## 8. Overseer UI

### 8.1 Layout

```
┌─────────────────────────────────────┬───────────────────────────┐
│                                     │  EMPIRE STATS PANEL       │
│                                     │  [leaderboard, turn info] │
│         LEAFLET MAP                 ├───────────────────────────┤
│         (70% of screen)             │  AI REASONING LOG         │
│                                     │  [thought bubbles]        │
│                                     ├───────────────────────────┤
│                                     │  DIPLOMACY FEED           │
│                                     │  [message log]            │
├─────────────────────────────────────┴───────────────────────────┤
│  TURN CONTROLS  [◀◀ prev] [⏸ pause] [▶ advance] [speed: ●●○○]  │
│  EVENT LOG  [scrollable feed of what happened this turn]        │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Panel Descriptions

**Empire Stats Panel**

- Empire name, color badge, territory count, army count, treasury
- Sorted by territory count (leading empire on top)
- Diplomatic relation icons between empires

**AI Reasoning Log**

- Each empire's `reasoning` field from this turn's AI response
- Shown as a colored text block per empire
- Persists for 3 turns, then fades out
- Thinking spinner shown while that empire's AI call is in flight

**Diplomacy Feed**

- Every `send_message` action and every proposal (trade, alliance, war declaration) as a timeline
- Color-coded by sending empire
- Format: `[Turn 14] 🔴 Iron Throne → 🔵 Merchant Republic: "Join me against the Dragon or face us both."`

**Turn Controls**

- Pause / advance turn manually
- Auto-advance toggle with speed: Slow (8s between turns), Normal (4s), Fast (1s)
- Current turn number and phase indicator

**Event Log**

- Scrollable feed of resolved actions: battles won/lost, territory changes, events triggered
- Pinned "this turn" section at top, older turns collapsible below

### 8.3 Map Interactivity (Observer Only)

- **Click territory:** side tooltip showing owner, resources, armies present, terrain
- **Click army marker:** shows army details + last move
- **Hover territory:** subtle highlight, name label
- **Scroll/zoom:** standard Leaflet controls
- **Province drill-down button:** appears on click of a territory that has province data

---

## 9. Turn Loop

### 9.1 Full Turn Sequence

```
TURN START
│
├─ Phase: "ai_thinking"
│   ├─ Emit event → UI shows "Empires are planning..."
│   ├─ AIController.runAITurn(gameState)
│   │   ├─ For each empire: build prompts → call OpenRouter → parse response
│   │   └─ Populate gameState.pendingActions
│   └─ Emit event → UI shows reasoning bubbles
│
├─ Phase: "resolution"
│   ├─ GameEngine.resolveTurn(gameState, pendingActions)
│   │   ├─ Apply actions in resolution order (Section 7.1)
│   │   ├─ Resolve combat
│   │   ├─ Update economy
│   │   ├─ Roll world events
│   │   └─ Return newGameState
│   ├─ Animate map changes (army movements, territory color changes)
│   └─ Push current state to turnHistory
│
├─ Phase: "awaiting_advance"
│   ├─ Update all UI panels with new state
│   ├─ StorageAdapter.save(newGameState)  ← persistence hook
│   ├─ Check win condition
│   └─ If auto-advance: wait speed_delay → loop back to TURN START
│       If manual: wait for user click → loop back to TURN START
│
REPEAT
```

### 9.2 Win Condition

Default win condition: **control 60% of European territories.** This is configurable in `GameConfig`. Other modes (survive N turns, eliminate all rivals) can be added later.

When win condition met: simulation pauses, winner announced, full game history available for review.

### 9.3 Event System (JS Custom Events)

The game engine communicates with the UI exclusively through browser custom events on `document`. This keeps the engine fully decoupled from the DOM.

```js
// Events emitted by engine/AI, listened to by UI modules
'empire-wars:turn-started'; // { turn }
'empire-wars:ai-thinking'; // { empireId }
'empire-wars:ai-done'; // { empireId, reasoning }
'empire-wars:resolution-start'; // { pendingActions }
'empire-wars:state-updated'; // { newState }  ← UI re-renders on this
'empire-wars:battle-occurred'; // { territory, attacker, defender, outcome }
'empire-wars:territory-changed'; // { territoryId, fromEmpire, toEmpire }
'empire-wars:game-over'; // { winner }
```

---

## 10. File-by-File Build Order

Build in this sequence to always have a runnable state:

### Phase 1 — Static Foundation

1. `index.html` — scaffold with map div + panel divs
2. `style.css` — dark theme CSS variables, layout grid
3. `data/europe.geojson` — download from Natural Earth
4. `data/territories.js` — static metadata for ~30 European countries
5. `data/empires.js` — 3 empire definitions with colors + personalities
6. `map/MapTheme.js` + `map/MapController.js` — get dark Leaflet map rendering
7. `map/TerritoryLayer.js` — color territories by empire, hover/click handlers

**Checkpoint:** Map renders, territories are colored, clicking shows a tooltip. No game logic yet.

### Phase 2 — State & Engine

8. `engine/GameState.js` — schema + constructor + deepClone utility
9. `engine/CombatResolver.js` — battle math, no side effects
10. `engine/EconomyEngine.js` — resource calculations
11. `engine/DiplomacyEngine.js` — relation state machine
12. `engine/EventSystem.js` — random event roller
13. `engine/GameEngine.js` — ties all sub-engines together, `resolveTurn()` function

**Checkpoint:** Can call `resolveTurn()` with a hardcoded state + actions in the browser console and get a valid new state back.

### Phase 3 — AI System

14. `ai/OpenRouterClient.js` — fetch wrapper + error handling
15. `ai/PromptBuilder.js` — system + user prompt generators
16. `ai/ResponseParser.js` — JSON validation + action schema check
17. `ai/AIController.js` — sequential per-empire call orchestration

**Checkpoint:** Can run one full AI turn in the console and see valid parsed actions returned.

### Phase 4 — Turn Loop

18. `main.js` — game bootstrap, `GameConfig`, setup screen (API key input, start button)
19. Turn loop wiring: `ai_thinking → resolution → awaiting_advance → repeat`
20. `map/ArmyLayer.js` — army markers + movement animations

**Checkpoint:** Full game runs end-to-end. Map updates each turn. No UI panels yet, but events log to console.

### Phase 5 — Overseer UI

21. `ui/TurnControls.js` — pause, advance, speed controls
22. `ui/EmpireStats.js` — leaderboard panel
23. `ui/ReasoningLog.js` — AI thought bubbles
24. `ui/DiplomacyFeed.js` — message timeline
25. `ui/EventLog.js` — turn history feed
26. `ui/OverseersPanel.js` — wires all UI panels, listens to custom events

**Checkpoint:** Full playable simulation with complete overseer UI.

### Phase 6 — Polish & Hardening

27. Province drill-down (load per-country GeoJSON on demand)
28. `StorageAdapter.js` stub (console.log save/load for now, ready for real impl)
29. Win condition + game-over screen
30. Error states (API failure, AI bad response, rate limiting)
31. Setup screen improvements (empire customization, personality picker)

---

## 11. Open Questions & Future Work

### Deferred but Architecture-Ready

- **Persistence:** `StorageAdapter.js` stub is in place. Implementing it means adding localStorage/IndexedDB writes in one file.
- **Multi-model:** `empires.js` already has a `model` field per empire. Routing different empires to different OpenRouter models is a one-line change per empire.
- **Player control:** The observer role is a locked perspective. Adding a "play as empire" mode means routing one empire's actions through a UI action panel instead of the AI controller — the engine doesn't care which source the actions come from.
- **Replays:** `turnHistory` stores full snapshots. A replay viewer just needs to walk that array and re-render state at each index.
- **Backend/multiplayer:** The engine is pure functions on a serializable state. Moving it server-side means wrapping `resolveTurn()` in an API endpoint.

### Notes

- Empires assigned randomly.
- Each empire will start with a medium sized army so that they can conquer territories and fight
- Please tell AI which turn it is - this will encourage late-game decisions. Also, we need a setting for turn count, let default be 50.
