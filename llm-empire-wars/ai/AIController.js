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

    empires.forEach(empire => {
      document.dispatchEvent(new CustomEvent('empire-wars:ai-thinking', {
        detail: { empireId: empire.id },
      }));
    });

    const promises = empires.map(empire =>
      this._callEmpireAI(empire, gameState)
        .then(result => {
          gameState.pendingActions[empire.id] = result.actions;
          results[empire.id] = result;
          document.dispatchEvent(new CustomEvent('empire-wars:ai-done', {
            detail: { empireId: empire.id, reasoning: result.reasoning, actions: result.actions },
          }));
        })
        .catch(err => {
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
        })
    );

    await Promise.allSettled(promises);
    return results;
  }

  async _callEmpireAI(empire, gameState) {
    const maxAttempts = 3;
    const systemPrompt = this.promptBuilder.buildSystem(empire);
    let userPrompt = this.promptBuilder.buildUser(empire, gameState);
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const rawResponse = await callAI(systemPrompt, userPrompt);
        const result = this.parser.parse(rawResponse);

        if (result.success) {
          return { reasoning: result.reasoning, actions: result.actions };
        }

        lastError = result.error;
        userPrompt = this.parser.buildRetryPrompt(userPrompt, result.error);
      } catch (err) {
        lastError = err.message;
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }

    console.warn(`AI failed ${maxAttempts} attempts for ${empire.name}: ${lastError}`);
    return {
      reasoning: `[AI Error after ${maxAttempts} attempts: ${lastError}] Empire does nothing.`,
      actions: [{ type: 'do_nothing' }],
    };
  }
}
