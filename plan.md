## Feature Assessment: Difficulty, Dependencies & Roadmap

### Difficulty Ratings (1 = trivial, 10 = hardest)

| #   | Feature                                                                | Difficulty | Files Touched | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------- | :--------: | :-----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Impose Embargo**                                                     |  **2/10**  |       3       | Near-identical to existing `declare_war` / `break_alliance` pattern in `DiplomacyEngine`. New action type, flip a flag on the relation, reduce target income in `EconomyEngine.updateEconomy`. Almost copy-paste from existing diplomacy machinery.                                                                                                                                                                                                |
| 2   | **Rare Resources (Oil, Uranium, etc.)**                                |  **4/10**  |       4       | Add fields to `TERRITORY_DATA`, surface them in `PromptBuilder`, and gate specific actions on resource ownership in the engine. The data entry in `territories.js` (84 territories) is the bulk of the work, not the logic.                                                                                                                                                                                                                        |
| 3   | **Radar Station** (1-hop extended vision)                              |  **3/10**  |       3       | New entry in `BUILDING_DEFS`, then modify `PromptBuilder._getVisibleNeighbors` to do a second adjacency hop when a radar exists. Pure data logic, no UI changes.                                                                                                                                                                                                                                                                                   |
| 4   | **UAV Recon action**                                                   |  **3/10**  |       4       | New action in `ResponseParser`, process it in `GameEngine` (store revealed intel on state), and feed the result into `PromptBuilder` under an `INTELLIGENCE REPORT` section. Similar plumbing to espionage.                                                                                                                                                                                                                                        |
| 5   | **Missile Silo + SAM Battery + build/launch missile**                  |  **6/10**  |       6       | This is the most mechanically complex single feature. Needs: new buildings in `BUILDING_DEFS`, a `missiles` inventory on state, `build_missile` and `launch_missile` actions in `ResponseParser`, a full resolution method in a new or existing engine file (SAM interception rolls, damage application, building destruction), and prompt updates. Many moving parts but each piece is small.                                                     |
| 6   | **Space Command Center + Launch Satellite**                            |  **4/10**  |       4       | Building + action. Satellite stores a permanent region-wide visibility flag on the empire's state. `PromptBuilder` checks it to expand the intelligence section. Simpler than missiles because there's no counter-play resolution step.                                                                                                                                                                                                            |
| 7   | **Cyber Warfare** (building, hack, grid shutdown, sabotage, detection) |  **5/10**  |       5       | Building prerequisite + 2 hack sub-types + detection roll if target has a matching building. Each sub-type applies a timed debuff (stored in `activeEvents`). Moderate complexity because of the branching outcomes, but the `activeEvents` system already handles timed effects perfectly.                                                                                                                                                        |
| 8   | **Fund Insurgency**                                                    |  **3/10**  |       4       | New action, spawn a neutral hostile army in target territory (the neutral army spawning code already exists in `GameState.createInitialState`), deduct Capital. Optional: hide the funder's identity from the victim's prompt. Very self-contained.                                                                                                                                                                                                |
| 9   | **Progression / Tech Tree**                                            |  **7/10**  |      7+       | This is the **most cross-cutting** feature. It requires: a new `techs` state block on each empire, a new `ResearchEngine.js`, a `research` action, tech definitions with costs/prerequisites, gating logic sprinkled across _every other feature_ (missiles require tech X, cyber requires tech Y), and significant prompt additions explaining available/locked techs. It doesn't produce visible gameplay on its own -- it gates other features. |
| 10  | **Blocs** (multi-empire coalitions)                                    |  **5/10**  |       5       | Extends the existing `relations` system. Needs a `blocs` state object, `form_bloc` / `join_bloc` actions, shared visibility logic in `PromptBuilder`, and automatic mutual defense in `DiplomacyEngine._callAlliesToWar`. The coalition system in `CombatResolver._buildCoalitions` already handles allied combat, so blocs mostly just auto-manage alliance status.                                                                               |
| 11  | **Global Chokepoints & Maritime Toll**                                 |  **3/10**  |       3       | Tag specific territories in `TERRITORY_DATA` with `chokepoint: true`. In `EconomyEngine.updateEconomy`, check if the `findTradeRoute` path passes through an enemy-owned chokepoint -- if so, deduct a toll or block entirely. The `findTradeRoute` BFS already exists. Minimal new logic.                                                                                                                                                         |
| 12  | **Visual Missile Flight Lines**                                        |  **3/10**  |       2       | `OverlayLayer.js` already renders animated polylines (trade routes, war zones). A missile arc is a quadratic bezier between two centroids with a high midpoint. Add a method, call it from `main.js` after turn resolution. Pure visual, no engine changes.                                                                                                                                                                                        |
| 13  | **Visual Satellite/UAV Sweeps**                                        |  **4/10**  |       3       | Needs a new overlay group in `OverlayLayer.js` that draws a semi-transparent, empire-colored GeoJSON fill over targeted territories with a CSS pulsing animation (similar to existing `heat-territory` class). Slightly harder than missile lines because it must read active UAV/satellite state to know which territories to highlight.                                                                                                          |

---

### Natural Groupings (features that share plumbing and should be built together)

**Group A: "Diplomacy & Economic Warfare"**

- 1 (Embargo) + 11 (Chokepoints & Tolls)
- _Why together_: Both modify `EconomyEngine.updateEconomy` and the trade route system. Embargo severs relations; chokepoints tax routes. They share the same code paths.

**Group B: "Intelligence & Surveillance"**

- 3 (Radar) + 4 (UAV Recon) + 6 (Space Command / Satellite)
- _Why together_: All three modify the same function: `PromptBuilder._getVisibleNeighbors` and the intel section of `buildUser`. They all store visibility data on state and surface it identically. Build the "intel framework" once, then each feature is just a different trigger for expanded vision.

**Group C: "Strike Warfare & Countermeasures"**

- 5 (Missiles + SAM) + 12 (Visual Missile Lines)
- _Why together_: The visual layer is pointless without the engine mechanic, and you'll want to test missiles visually as you build them. Ship them as one unit.

**Group D: "Shadow Operations"**

- 7 (Cyber Warfare) + 8 (Fund Insurgency)
- _Why together_: Both are covert actions that apply damage/debuffs without physical army movement. Both benefit from the same "was the attacker detected?" roll pattern. Both spawn timed effects via `activeEvents`.

**Group E: "Progression System"**

- 9 (Tech Tree) + 2 (Rare Resources)
- _Why together_: Rare resources are the _fuel_ for the tech tree. Oil gates vehicle/missile production; uranium gates advanced warheads; rare metals gate cyber/space tech. The resource system defines _what you need_, the tech tree defines _what you can unlock_. Designing them separately leads to awkward retrofitting.

**Group F: "Geopolitics"**

- 10 (Blocs)
- _Standalone but late_: Blocs layer on top of the diplomacy system and benefit from all other features being in place so the AI has meaningful reasons to form blocs (shared missile defense, shared intel, etc.).

---

### Implementation Roadmap

Here is the recommended build order, designed so that each phase produces a **playable, testable improvement** and later phases cleanly layer on top.

#### Phase 1: Economic Warfare Foundation

**Features**: Embargo (1) + Chokepoints (11)
**Estimated effort**: Small
**Why first**: Zero prerequisites. Extends existing, well-tested diplomacy and economy code. Immediately makes the simulation more interesting by giving the AI non-military ways to hurt rivals. Creates the economic pressure that makes later features (rare resources, tech investment) feel meaningful.

#### Phase 2: Rare Resources & Gating Framework

**Features**: Rare Resources (2) + Progression/Tech Tree skeleton (9)
**Estimated effort**: Medium-large
**Why second**: This is the **backbone** that every later feature depends on. We define the resource types (oil, uranium, rare*metals), tag territories, build the `ResearchEngine.js` with tech definitions and costs, and add the `research` action. At this stage, the tech tree can gate the \_existing* buildings (e.g., Arms Factory requires "Industrial Expansion" tech -- or just leave existing buildings ungated and only gate new ones). The key output is: the state schema, the research action, and the gating check function that all future features call.

#### Phase 3: Intelligence & Surveillance

**Features**: Radar (3) + UAV Recon (4) + Satellite (6) + Visual Satellite Sweeps (13)
**Estimated effort**: Medium
**Why third**: Now that the tech tree exists, these features slot in as early-to-mid tier unlocks. Radar is a building (no tech gate, or Tier 1 gate). UAV Recon requires a Tier 2 tech. Satellite requires Space Command Center + Tier 3 tech. Visual sweeps ship alongside to make recon visible to the spectator. This phase transforms the fog-of-war system from static adjacency checks into a dynamic intelligence game.

#### Phase 4: Strike Warfare & Countermeasures

**Features**: Missiles + SAM (5) + Visual Missile Lines (12)
**Estimated effort**: Medium-large
**Why fourth**: Missiles are the crown jewel of distant warfare and need the tech tree (Tier 3 unlock), rare resources (missiles consume oil or uranium to build), and ideally the intel system (you want to know _where_ to aim). SAM batteries create the counter-play. Visual flight arcs make this incredibly dramatic for spectators.

#### Phase 5: Shadow Operations

**Features**: Cyber Warfare (7) + Fund Insurgency (8)
**Estimated effort**: Medium
**Why fifth**: These are asymmetric tools that become most interesting when the game already has valuable targets to sabotage (missile silos, radar stations, factories built in earlier phases). Cyber warfare gates behind a Tier 2-3 tech. Insurgency is cheaper and available earlier. Both add a stealth dimension that complements the now-rich military and economic systems.

#### Phase 6: Global Alliances

**Features**: Blocs (10)
**Estimated effort**: Medium
**Why last**: Blocs are the capstone political mechanic. By this point, empires have shared intel (satellites), shared defense (SAM grids), economic interdependence (trade + chokepoints + embargoes), and technological arms races. Blocs formalize what the AI is already doing informally. They also create the most dramatic late-game moments: bloc vs. bloc wars with coordinated missile strikes, shared radar vision, and collective embargoes.

---

### Visual Summary

```
Phase 1 ─── Embargo + Chokepoints ──────────────── (quick win, economy)
   │
Phase 2 ─── Rare Resources + Tech Tree ─────────── (backbone, gates everything)
   │
Phase 3 ─── Radar + UAV + Satellite + Sweep UI ─── (intel layer)
   │
Phase 4 ─── Missiles + SAM + Flight Lines UI ───── (strike layer)
   │
Phase 5 ─── Cyber Warfare + Insurgency ─────────── (shadow layer)
   │
Phase 6 ─── Blocs ──────────────────────────────── (capstone politics)
```

Each phase is independently shippable and testable. You can run a full simulation after any phase and see meaningful new AI behavior.
