import { ADJACENCY } from '../data/territories.js';

import { BUILDING_DEFS } from '../data/territories.js';

const ACTION_SCHEMA = {
  move_army:         { required: ['army_id', 'to'] },
  recruit_units:     { required: ['territory_id', 'amount'] },
  build:             { required: ['territory_id', 'building'] },
  hire_mercenaries:  { required: ['territory_id', 'amount'] },
  buy_manpower:      { required: ['amount'] },
  declare_war:       { required: ['target_empire_id'] },
  propose_peace:     { required: ['target_empire_id'] },
  propose_trade:     { required: ['target_empire_id'] },
  propose_alliance:  { required: ['target_empire_id'] },
  break_alliance:    { required: ['target_empire_id'] },
  send_message:      { required: ['target_empire_id', 'message'] },
  impose_embargo:    { required: ['target_empire_id'] },
  lift_embargo:      { required: ['target_empire_id'] },
  espionage:         { required: ['target_empire_id'] },
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
      case 'hire_mercenaries':
        return this._coerceHireMercenaries(action, empireId, gameState);
      case 'buy_manpower':
        return this._coerceBuyManpower(action, empireId, gameState);
      case 'declare_war':
      case 'propose_peace':
      case 'propose_trade':
      case 'propose_alliance':
      case 'break_alliance':
      case 'impose_embargo':
      case 'lift_embargo':
      case 'espionage':
        return this._coerceEmpireTarget(action, empireId, gameState);
      case 'send_message':
        return this._coerceSendMessage(action, empireId, gameState);
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

  _coerceHireMercenaries(action, empireId, gameState) {
    let tid = this._resolveTerritoryId(action.territory_id, gameState);

    if (!tid || !gameState.territories[tid] || gameState.territories[tid].ownerId !== empireId) {
      const myTerritories = Object.values(gameState.territories).filter(t => t.ownerId === empireId);
      if (myTerritories.length === 0) return null;
      tid = myTerritories[0].id;
    }

    const amount = Math.min(Math.max(1, parseInt(action.amount, 10) || 1), 3);
    return { ...action, territory_id: tid, amount };
  }

  _coerceBuyManpower(action, empireId, gameState) {
    const amount = Math.min(Math.max(1, parseInt(action.amount, 10) || 1), 5);
    return { ...action, amount };
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

    if (action.type === 'recruit_units' || action.type === 'hire_mercenaries' || action.type === 'buy_manpower') {
      action.amount = parseInt(action.amount, 10);
      if (isNaN(action.amount) || action.amount < 1) {
        return { valid: false, error: `${action.type}: amount must be >= 1` };
      }
    }

    if (action.type === 'build') {
      if (!BUILDING_DEFS[action.building]) {
        return { valid: false, error: `build: building must be one of ${Object.keys(BUILDING_DEFS).join(', ')}` };
      }
    }

    return { valid: true };
  }

  buildRetryPrompt(originalPrompt, error) {
    return `${originalPrompt}\n\n⚠️ YOUR PREVIOUS RESPONSE WAS INVALID: ${error}\nPlease respond with ONLY a valid JSON object matching the schema above.`;
  }
}
