import { EmpireStats } from './EmpireStats.js';
import { ReasoningLog } from './ReasoningLog.js';
import { DiplomacyFeed } from './DiplomacyFeed.js';
import { EventLog } from './EventLog.js';
import { TurnControls } from './TurnControls.js';

export class OverseersPanel {
  constructor(callbacks) {
    this.empireStats = new EmpireStats(document.getElementById('empire-stats'));
    this.reasoningLog = new ReasoningLog(document.getElementById('reasoning-log'));
    this.diplomacyFeed = new DiplomacyFeed(document.getElementById('diplomacy-feed'));
    this.eventLog = new EventLog(document.getElementById('event-log'));
    this.turnControls = new TurnControls(
      document.getElementById('turn-controls'),
      callbacks.onAdvance,
      callbacks.onToggleAuto,
    );

    this._bindEvents();
  }

  _bindEvents() {
    document.addEventListener('empire-wars:ai-thinking', (e) => {
      this.gameState && this.reasoningLog.showThinking(e.detail.empireId, this.gameState);
    });

    document.addEventListener('empire-wars:ai-done', (e) => {
      if (!this.gameState) return;
      this.reasoningLog.showReasoning(
        e.detail.empireId,
        e.detail.reasoning,
        this.gameState,
        e.detail.error,
      );
    });
  }

  updateState(gameState) {
    this.gameState = gameState;
    this.empireStats.update(gameState);
    this.diplomacyFeed.update(gameState);
    this.eventLog.update(gameState);
    this.turnControls.updateState(gameState);
  }

  setPhase(phase) {
    this.turnControls.setPhase(phase);
  }

  getAutoDelay() {
    return this.turnControls.getDelay();
  }

  get isAutoPlay() {
    return this.turnControls.autoPlay;
  }
}
