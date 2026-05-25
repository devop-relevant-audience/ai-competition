import { ADJACENCY } from '../data/territories.js';

import { BUILDING_DEFS } from '../data/territories.js';
import { TECH_DEFS } from '../data/techs.js';

const ACTION_SCHEMA = {
  move_army:         { required: ['army_id', 'to'] },
  recruit_units:     { required: ['territory_id', 'amount'] },
  build:             { required: ['territory_id', 'building'] },
  research:          { required: ['tech_id'] },
  declare_war:       { required: ['target_empire_id'] },
  propose_peace:     { required: ['target_empire_id'] },
  propose_trade:     { required: ['target_empire_id'] },
  propose_alliance:  { required: ['target_empire_id'] },
  break_alliance:    { required: ['target_empire_id'] },
  send_message:      { required: ['target_empire_id', 'message'] },
  impose_embargo:    { required: ['target_empire_id'] },
  lift_embargo:      { required: ['target_empire_id'] },
  build_missile:     { required: ['territory_id'] },
  launch_missile:    { required: ['from_territory_id', 'target_territory_id'] },
  build_nuke:        { required: ['territory_id'] },
  launch_nuke:       { required: ['from_territory_id', 'target_territory_id'] },
  uav_recon:         { required: ['target_territory_id'] },
  launch_satellite:  { required: ['territory_id'] },
  do_nothing:        { required: [] },
};

export class ResponseParser {
  parse(rawContent) {
    const jsonStr = this._extractJSON(rawContent);
    if (!jsonStr) {
      return { success: false, error: 'No valid JSON found in response' };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { success: false, error: `JSON parse error: ${e.message}` };
    }

    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided.';
    }

    if (!Array.isArray(parsed.actions)) {
      return { success: false, error: '"actions" must be an array' };
    }

    if (parsed.actions.length === 0) {
      parsed.actions = [{ type: 'do_nothing' }];
    }

    if (parsed.actions.length > 5) {
      parsed.actions = parsed.actions.slice(0, 5);
    }

    const validActions = [];
    const errors = [];

    for (const action of parsed.actions) {
      const result = this._validateAction(action);
      if (result.valid) {
        validActions.push(action);
      } else {
        errors.push(result.error);
      }
    }

    if (validActions.length === 0) {
      validActions.push({ type: 'do_nothing' });
    }

    return {
      success: true,
      reasoning: parsed.reasoning,
      actions: validActions,
      warnings: errors,
    };
  }

  parseProposalDecisions(rawContent, proposals) {
    const jsonStr = this._extractJSON(rawContent);
    if (!jsonStr) return proposals.map(() => ({ accept: false }));

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return proposals.map(() => ({ accept: false }));
    }

    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];

    return proposals.map(p => {
      const match = decisions.find(d =>
        d.from_empire_id === p.empireId ||
        d.from_empire === p.empireId ||
        d.empire_id === p.empireId
      );
      if (match) {
        const accepted = match.accept === true ||
          match.decision === 'accept' ||
          match.accepted === true;
        return { fromEmpireId: p.empireId, accept: accepted, reason: match.reason || '' };
      }
      return { fromEmpireId: p.empireId, accept: false, reason: 'No decision provided' };
    });
  }

  validateAndCoerce(actions, empireId, gameState) {
    const coerced = [];

    for (const action of actions) {
      if (action.type === 'do_nothing') {
        coerced.push(action);
        continue;
      }

      const fixed = this._coerceAction(action, empireId, gameState);
      if (fixed) coerced.push(fixed);
    }

    if (coerced.length === 0) {
      coerced.push({ type: 'do_nothing' });
    }

    return coerced;
  }

  _coerceAction(action, empireId, gameState) {
    switch (action.type) {
      case 'move_army':
        return this._coerceMoveArmy(action, empireId, gameState);
      case 'recruit_units':
        return this._coerceRecruit(action, empireId, gameState);
      case 'build':
        return this._coerceBuild(action, empireId, gameState);
      case 'research':
        return this._coerceResearch(action, empireId, gameState);
      case 'declare_war':
      case 'propose_peace':
      case 'propose_trade':
      case 'propose_alliance':
      case 'break_alliance':
      case 'impose_embargo':
      case 'lift_embargo':
        return this._coerceEmpireTarget(action, empireId, gameState);
      case 'send_message':
        return this._coerceSendMessage(action, empireId, gameState);
      case 'build_missile':
        return this._coerceBuildMissile(action, empireId, gameState);
      case 'launch_missile':
        return this._coerceLaunchMissile(action, empireId, gameState);
      case 'build_nuke':
        return this._coerceBuildNuke(action, empireId, gameState);
      case 'launch_nuke':
        return this._coerceLaunchNuke(action, empireId, gameState);
      case 'uav_recon':
        return this._coerceUavRecon(action, empireId, gameState);
      case 'launch_satellite':
        return this._coerceLaunchSatellite(action, empireId, gameState);
      default:
        return action;
    }
  }

  _coerceMoveArmy(action, empireId, gameState) {
    let armyId = this._resolveArmyId(action.army_id, empireId, gameState);
    if (!armyId) return null;

    let to = this._resolveTerritoryId(action.to, gameState);
    if (!to) return null;

    const army = gameState.armies[armyId];
    const adjacent = ADJACENCY[army.locationId] || [];

    if (!adjacent.includes(to)) {
      const reachable = adjacent.find(tid => {
        if (!gameState.territories[tid]) return false;
        const rel = this._getRelWithOwner(gameState, empireId, gameState.territories[tid]?.ownerId);
        return !(rel && rel.status === 'alliance');
      });
      if (reachable) {
        to = reachable;
      } else {
        return null;
      }
    }

    return { ...action, army_id: armyId, to };
  }

  _coerceRecruit(action, empireId, gameState) {
    let tid = this._resolveTerritoryId(action.territory_id, gameState);

    if (!tid || !gameState.territories[tid] || gameState.territories[tid].ownerId !== empireId) {
      const myTerritories = Object.values(gameState.territories).filter(t => t.ownerId === empireId);
      if (myTerritories.length === 0) return null;
      myTerritories.sort((a, b) => b.resources.industry - a.resources.industry);
      tid = myTerritories[0].id;
    }

    const territory = gameState.territories[tid];
    const maxRecruit = Math.floor(territory.resources.industry / 2);
    const amount = Math.min(Math.max(1, parseInt(action.amount, 10) || 1), maxRecruit);
    if (amount <= 0) return null;

    return { ...action, territory_id: tid, amount };
  }

  _coerceBuild(action, empireId, gameState) {
    let tid = this._resolveTerritoryId(action.territory_id, gameState);

    if (!tid || !gameState.territories[tid] || gameState.territories[tid].ownerId !== empireId) {
      const myTerritories = Object.values(gameState.territories).filter(t => t.ownerId === empireId);
      if (myTerritories.length === 0) return null;
      tid = myTerritories[0].id;
    }

    const building = String(action.building || '').toLowerCase();
    if (!BUILDING_DEFS[building]) return null;

    return { ...action, territory_id: tid, building };
  }

  _coerceResearch(action, empireId, gameState) {
    let techId = String(action.tech_id || '').toLowerCase().replace(/[\s-]+/g, '_');

    if (!TECH_DEFS[techId]) {
      for (const [id, def] of Object.entries(TECH_DEFS)) {
        if (def.label.toLowerCase().replace(/[\s-]+/g, '_') === techId) { techId = id; break; }
        if (id.includes(techId) || techId.includes(id)) { techId = id; break; }
        if (def.label.toLowerCase().includes(techId.replace(/_/g, ' '))) { techId = id; break; }
      }
    }
    if (!TECH_DEFS[techId]) return null;

    let labTerritoryId = action.lab_territory_id;
    if (labTerritoryId) {
      labTerritoryId = this._resolveTerritoryId(labTerritoryId, gameState);
    }

    return { ...action, tech_id: techId, lab_territory_id: labTerritoryId || undefined };
  }

  _coerceEmpireTarget(action, empireId, gameState) {
    const resolved = this._resolveEmpireId(action.target_empire_id, empireId, gameState);
    if (!resolved) return null;
    return { ...action, target_empire_id: resolved };
  }

  _coerceSendMessage(action, empireId, gameState) {
    const resolved = this._resolveEmpireId(action.target_empire_id, empireId, gameState);
    if (!resolved) return null;
    return { ...action, target_empire_id: resolved, message: action.message || '...' };
  }

  _coerceBuildMissile(action, empireId, gameState) {
    let tid = this._resolveTerritoryId(action.territory_id, gameState);

    if (!tid || !gameState.territories[tid] || gameState.territories[tid].ownerId !== empireId) {
      const mysilos = Object.values(gameState.territories).filter(
        t => t.ownerId === empireId && t.buildings?.missile_silo &&
          (t.missiles || 0) + (t.nukes || 0) < 3
      );
      if (mysilos.length === 0) return null;
      tid = mysilos[0].id;
    }

    const territory = gameState.territories[tid];
    if (!territory?.buildings?.missile_silo) return null;
    if ((territory.missiles || 0) + (territory.nukes || 0) >= 3) return null;

    return { ...action, territory_id: tid };
  }

  _coerceLaunchMissile(action, empireId, gameState) {
    let fromTid = this._resolveTerritoryId(action.from_territory_id, gameState);

    if (!fromTid || !gameState.territories[fromTid] || gameState.territories[fromTid].ownerId !== empireId) {
      const silosWithMissiles = Object.values(gameState.territories).filter(
        t => t.ownerId === empireId && t.buildings?.missile_silo && (t.missiles || 0) > 0
      );
      if (silosWithMissiles.length === 0) return null;
      fromTid = silosWithMissiles[0].id;
    }

    const from = gameState.territories[fromTid];
    if (!from?.buildings?.missile_silo || (from.missiles || 0) <= 0) return null;

    let targetTid = this._resolveTerritoryId(action.target_territory_id, gameState);
    if (!targetTid || !gameState.territories[targetTid]) return null;

    const targetOwner = gameState.territories[targetTid].ownerId;
    if (targetOwner === empireId) return null;
    if (targetOwner && targetOwner !== 'neutral') {
      const rel = this._getRelWithOwner(gameState, empireId, targetOwner);
      if (!rel || rel.status !== 'war') return null;
    }

    return { ...action, from_territory_id: fromTid, target_territory_id: targetTid };
  }

  _coerceBuildNuke(action, empireId, gameState) {
    const empire = gameState.empires[empireId];
    if (!empire?.techs?.completed?.includes('nuclear_arsenal')) return null;

    let tid = this._resolveTerritoryId(action.territory_id, gameState);

    if (!tid || !gameState.territories[tid] || gameState.territories[tid].ownerId !== empireId) {
      const mysilos = Object.values(gameState.territories).filter(
        t => t.ownerId === empireId && t.buildings?.missile_silo &&
          (t.missiles || 0) + (t.nukes || 0) < 3
      );
      if (mysilos.length === 0) return null;
      tid = mysilos[0].id;
    }

    const territory = gameState.territories[tid];
    if (!territory?.buildings?.missile_silo) return null;
    if ((territory.missiles || 0) + (territory.nukes || 0) >= 3) return null;

    return { ...action, territory_id: tid };
  }

  _coerceLaunchNuke(action, empireId, gameState) {
    const empire = gameState.empires[empireId];
    if (!empire?.techs?.completed?.includes('nuclear_arsenal')) return null;

    let fromTid = this._resolveTerritoryId(action.from_territory_id, gameState);

    if (!fromTid || !gameState.territories[fromTid] || gameState.territories[fromTid].ownerId !== empireId) {
      const silosWithNukes = Object.values(gameState.territories).filter(
        t => t.ownerId === empireId && t.buildings?.missile_silo && (t.nukes || 0) > 0
      );
      if (silosWithNukes.length === 0) return null;
      fromTid = silosWithNukes[0].id;
    }

    const from = gameState.territories[fromTid];
    if (!from?.buildings?.missile_silo || (from.nukes || 0) <= 0) return null;

    let targetTid = this._resolveTerritoryId(action.target_territory_id, gameState);
    if (!targetTid || !gameState.territories[targetTid]) return null;

    const targetTerritory = gameState.territories[targetTid];
    if (targetTerritory.wasteland) return null;
    const targetOwner = targetTerritory.ownerId;
    if (targetOwner === empireId) return null;
    if (targetOwner && targetOwner !== 'neutral') {
      const rel = this._getRelWithOwner(gameState, empireId, targetOwner);
      if (!rel || rel.status !== 'war') return null;
    }

    return { ...action, from_territory_id: fromTid, target_territory_id: targetTid };
  }

  _coerceUavRecon(action, empireId, gameState) {
    let targetTid = this._resolveTerritoryId(action.target_territory_id, gameState);
    if (!targetTid || !gameState.territories[targetTid]) return null;
    return { ...action, target_territory_id: targetTid };
  }

  _coerceLaunchSatellite(action, empireId, gameState) {
    let tid = this._resolveTerritoryId(action.territory_id, gameState);

    if (!tid || !gameState.territories[tid] || gameState.territories[tid].ownerId !== empireId) {
      const cmds = Object.values(gameState.territories).filter(
        t => t.ownerId === empireId && t.buildings?.space_command && !t.satelliteLaunched
      );
      if (cmds.length === 0) return null;
      tid = cmds[0].id;
    }

    const territory = gameState.territories[tid];
    if (!territory?.buildings?.space_command) return null;
    if (territory.satelliteLaunched) return null;

    return { ...action, territory_id: tid };
  }

  _resolveArmyId(armyId, empireId, gameState) {
    if (gameState.armies[armyId] && gameState.armies[armyId].empireId === empireId) {
      return armyId;
    }

    const myArmies = Object.values(gameState.armies).filter(a => a.empireId === empireId);
    if (myArmies.length === 0) return null;

    for (const army of myArmies) {
      if (army.id.includes(armyId) || armyId.includes(army.id)) return army.id;
    }

    for (const army of myArmies) {
      const loc = army.locationId.replace(/_/g, ' ');
      if (armyId.toLowerCase().includes(loc)) return army.id;
    }

    const withMoves = myArmies.filter(a => a.movesRemaining > 0);
    if (withMoves.length > 0) {
      withMoves.sort((a, b) => b.size - a.size);
      return withMoves[0].id;
    }

    myArmies.sort((a, b) => b.size - a.size);
    return myArmies[0].id;
  }

  _resolveTerritoryId(tid, gameState) {
    if (!tid) return null;
    if (gameState.territories[tid]) return tid;

    const lower = String(tid).toLowerCase().replace(/\s+/g, '_');
    if (gameState.territories[lower]) return lower;

    for (const [id, t] of Object.entries(gameState.territories)) {
      if (t.name.toLowerCase() === String(tid).toLowerCase()) return id;
    }

    for (const [id, t] of Object.entries(gameState.territories)) {
      if (id.includes(lower) || lower.includes(id)) return id;
      if (t.name.toLowerCase().includes(String(tid).toLowerCase())) return id;
    }

    return null;
  }

  _resolveEmpireId(targetId, selfId, gameState) {
    if (!targetId) return null;
    if (targetId === selfId) return null;

    if (gameState.empires[targetId] && !gameState.empires[targetId].isEliminated) {
      return targetId;
    }

    const lower = String(targetId).toLowerCase();
    for (const e of Object.values(gameState.empires)) {
      if (e.isEliminated || e.id === selfId) continue;
      if (e.id.toLowerCase() === lower) return e.id;
      if (e.name.toLowerCase() === lower) return e.id;
      if (e.id.includes(lower) || lower.includes(e.id)) return e.id;
      if (e.name.toLowerCase().includes(lower)) return e.id;
    }

    return null;
  }

  _getRelWithOwner(gameState, empireId, ownerId) {
    if (!ownerId || empireId === ownerId) return null;
    const key = empireId < ownerId ? `${empireId}__${ownerId}` : `${ownerId}__${empireId}`;
    return gameState.relations[key] || null;
  }

  _extractJSON(content) {
    if (!content || typeof content !== 'string') return null;

    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    const braceStart = content.indexOf('{');
    const braceEnd = content.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      return content.slice(braceStart, braceEnd + 1);
    }

    return null;
  }

  _validateAction(action) {
    if (!action || typeof action !== 'object') {
      return { valid: false, error: 'Action is not an object' };
    }

    if (action.type === 'hire_mercenaries') {
      action.type = 'recruit_units';
      action.mercenary = true;
      action.amount = Math.min(parseInt(action.amount, 10) || 1, 3);
    }

    const schema = ACTION_SCHEMA[action.type];
    if (!schema) {
      if (action.type === 'accept_proposal' || action.type === 'reject_proposal') {
        return { valid: false, error: `"${action.type}" is no longer needed — proposals are resolved automatically` };
      }
      return { valid: false, error: `Unknown action type: "${action.type}"` };
    }

    for (const field of schema.required) {
      if (action[field] === undefined || action[field] === null) {
        return { valid: false, error: `Action "${action.type}" missing required field: "${field}"` };
      }
    }

    if (action.type === 'recruit_units') {
      action.amount = parseInt(action.amount, 10);
      if (isNaN(action.amount) || action.amount < 1) {
        return { valid: false, error: `${action.type}: amount must be >= 1` };
      }
      if (action.mercenary) {
        action.mercenary = true;
        action.amount = Math.min(action.amount, 3);
      }
    }

    if (action.type === 'build') {
      if (!BUILDING_DEFS[action.building]) {
        return { valid: false, error: `build: building must be one of ${Object.keys(BUILDING_DEFS).join(', ')}` };
      }
    }

    if (action.type === 'launch_missile' || action.type === 'launch_nuke') {
      if (action.from_territory_id === action.target_territory_id) {
        return { valid: false, error: `${action.type}: from and target territory must be different` };
      }
    }

    if (action.type === 'research') {
      const tid = String(action.tech_id || '').toLowerCase().replace(/[\s-]+/g, '_');
      const matched = TECH_DEFS[tid] || Object.entries(TECH_DEFS).find(([, d]) =>
        d.label.toLowerCase().replace(/[\s-]+/g, '_') === tid
      );
      if (!matched && !TECH_DEFS[tid]) {
        return { valid: false, error: `research: tech_id must be one of ${Object.keys(TECH_DEFS).join(', ')}` };
      }
    }

    return { valid: true };
  }

  buildRetryPrompt(originalPrompt, error) {
    return `${originalPrompt}\n\n⚠️ YOUR PREVIOUS RESPONSE WAS INVALID: ${error}\nPlease respond with ONLY a valid JSON object matching the schema above.`;
  }
}
