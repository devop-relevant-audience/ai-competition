import { callAI } from './OpenRouterClient.js';
import { PromptBuilder } from './PromptBuilder.js';
import { ResponseParser } from './ResponseParser.js';

export class AIController {
  constructor() {
    this.promptBuilder = new PromptBuilder();
    this.parser = new ResponseParser();
  }

  async runAITurn(gameState) {
    const empires = Object.values(gameState.empires).filter(e => !e.isEliminated);
    const results = {};

    for (const empire of empires) {
      document.dispatchEvent(new CustomEvent('empire-wars:ai-thinking', {
        detail: { empireId: empire.id },
      }));

      try {
        const result = await this._callEmpireAI(empire, gameState);
        gameState.pendingActions[empire.id] = result.actions;
        results[empire.id] = result;

        document.dispatchEvent(new CustomEvent('empire-wars:ai-done', {
          detail: {
            empireId: empire.id,
            reasoning: result.reasoning,
            actions: result.actions,
          },
        }));
      } catch (err) {
        console.error(`AI call failed for ${empire.name}:`, err);
        gameState.pendingActions[empire.id] = [{ type: 'do_nothing' }];

        document.dispatchEvent(new CustomEvent('empire-wars:ai-done', {
          detail: {
            empireId: empire.id,
            reasoning: `[AI Error: ${err.message}] Empire does nothing this turn.`,
            actions: [{ type: 'do_nothing' }],
            error: true,
          },
        }));
      }
    }

    return results;
  }

  async _callEmpireAI(empire, gameState) {
    const systemPrompt = this.promptBuilder.buildSystem(empire);
    const userPrompt = this.promptBuilder.buildUser(empire, gameState);

    const rawResponse = await callAI(systemPrompt, userPrompt);
    let result = this.parser.parse(rawResponse);

    if (!result.success) {
      const retryPrompt = this.parser.buildRetryPrompt(userPrompt, result.error);
      const retryResponse = await callAI(systemPrompt, retryPrompt);
      result = this.parser.parse(retryResponse);

      if (!result.success) {
        console.warn(`AI parse failed twice for ${empire.name}: ${result.error}`);
        return {
          reasoning: `[Parse Error] ${result.error}. Empire does nothing.`,
          actions: [{ type: 'do_nothing' }],
        };
      }
    }

    return {
      reasoning: result.reasoning,
      actions: result.actions,
    };
  }
}
