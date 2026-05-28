import { callAI } from './OpenRouterClient.js';
import { PromptBuilder } from './PromptBuilder.js';
import { ResponseParser } from './ResponseParser.js';
import { CongressEngine } from '../engine/CongressEngine.js';

const PROPOSAL_TYPES = ['propose_trade', 'propose_alliance', 'propose_peace'];

export class AIController {
  constructor() {
    this.promptBuilder = new PromptBuilder();
    this.parser = new ResponseParser();
    this.congressEngine = new CongressEngine();
  }

  async runAITurn(gameState) {
    if (this.congressEngine.shouldConvene(gameState)) {
      const resolution = this.congressEngine.generateResolution(gameState);
      const votes = await this._runCongressVote(gameState, resolution);
      const congressEvents = this.congressEngine.applyResolution(gameState, resolution, votes);
      gameState.eventLog.push(...congressEvents);
    }

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

    await this._resolveProposals(gameState);

    return results;
  }

  async _callEmpireAI(empire, gameState) {
    const maxAttempts = 2;
    const systemPrompt = this.promptBuilder.buildSystem(empire);
    let userPrompt = this.promptBuilder.buildUser(empire, gameState);
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const rawResponse = await callAI(systemPrompt, userPrompt, { model: empire.model });
        const result = this.parser.parse(rawResponse);

        if (result.success) {
          const coerced = this.parser.validateAndCoerce(result.actions, empire.id, gameState);
          return { reasoning: result.reasoning, actions: coerced };
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

  async _runCongressVote(gameState, resolution) {
    const empires = Object.values(gameState.empires).filter(e => !e.isEliminated);
    const votes = {};

    const promises = empires.map(async (empire) => {
      try {
        const systemPrompt = this.promptBuilder.buildCongressSystem(empire);
        const userPrompt = this.promptBuilder.buildCongressUser(empire, resolution, gameState);
        const raw = await callAI(systemPrompt, userPrompt, { model: empire.model, maxTokens: 300 });
        votes[empire.id] = this.parser.parseCongressVote(raw);
      } catch (err) {
        console.error(`Congress vote failed for ${empire.name}:`, err);
        votes[empire.id] = { vote: 'no', reasoning: 'Failed to vote' };
      }
    });

    await Promise.allSettled(promises);
    return votes;
  }

  async _resolveProposals(gameState) {
    const allProposals = [];

    for (const [empireId, actions] of Object.entries(gameState.pendingActions)) {
      for (const action of actions) {
        if (PROPOSAL_TYPES.includes(action.type)) {
          allProposals.push({ empireId, action });
        }
      }
    }

    if (allProposals.length === 0) return;

    const mutualResolved = new Set();
    for (let i = 0; i < allProposals.length; i++) {
      if (mutualResolved.has(i)) continue;
      const p = allProposals[i];
      for (let j = i + 1; j < allProposals.length; j++) {
        if (mutualResolved.has(j)) continue;
        const q = allProposals[j];
        if (
          q.empireId === p.action.target_empire_id &&
          q.action.target_empire_id === p.empireId &&
          q.action.type === p.action.type
        ) {
          p.action._accepted = true;
          q.action._accepted = true;
          mutualResolved.add(i);
          mutualResolved.add(j);
          break;
        }
      }
    }

    const byTarget = {};
    for (let i = 0; i < allProposals.length; i++) {
      if (mutualResolved.has(i)) continue;
      const p = allProposals[i];
      const targetId = p.action.target_empire_id;
      if (!byTarget[targetId]) byTarget[targetId] = [];
      byTarget[targetId].push(p);
    }

    const decisionPromises = Object.entries(byTarget).map(async ([targetId, proposals]) => {
      const targetEmpire = gameState.empires[targetId];
      if (!targetEmpire || targetEmpire.isEliminated) {
        proposals.forEach(p => { p.action._accepted = false; });
        return;
      }

      try {
        const systemPrompt = this.promptBuilder.buildProposalSystem(targetEmpire);
        const userPrompt = this.promptBuilder.buildProposalUser(targetEmpire, proposals, gameState);
        const rawResponse = await callAI(systemPrompt, userPrompt, {
          model: targetEmpire.model,
          maxTokens: 300,
        });
        const decisions = this.parser.parseProposalDecisions(rawResponse, proposals);

        for (const p of proposals) {
          const decision = decisions.find(d => d.fromEmpireId === p.empireId);
          p.action._accepted = decision ? decision.accept : false;
          p.action._decisionReason = decision?.reason || '';
        }
      } catch (err) {
        console.error(`Proposal decision failed for ${targetEmpire.name}:`, err);
        proposals.forEach(p => { p.action._accepted = false; });
      }
    });

    await Promise.allSettled(decisionPromises);
  }
}
