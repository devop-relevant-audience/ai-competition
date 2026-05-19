const ACTION_SCHEMA = {
  move_army:         { required: ['army_id', 'to'] },
  recruit_units:     { required: ['territory_id', 'amount'] },
  declare_war:       { required: ['target_empire_id'] },
  propose_peace:     { required: ['target_empire_id'] },
  propose_trade:     { required: ['target_empire_id'] },
  propose_alliance:  { required: ['target_empire_id'] },
  accept_proposal:   { required: ['target_empire_id'] },
  reject_proposal:   { required: ['target_empire_id'] },
  break_alliance:    { required: ['target_empire_id'] },
  send_message:      { required: ['target_empire_id', 'message'] },
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
        return { valid: false, error: 'recruit_units: amount must be >= 1' };
      }
    }

    return { valid: true };
  }

  buildRetryPrompt(originalPrompt, error) {
    return `${originalPrompt}\n\n⚠️ YOUR PREVIOUS RESPONSE WAS INVALID: ${error}\nPlease respond with ONLY a valid JSON object matching the schema above.`;
  }
}
