import { EmpireStats } from './EmpireStats.js';
import { ReasoningLog } from './ReasoningLog.js';
import { DiplomacyFeed } from './DiplomacyFeed.js';
import { MessagesFeed } from './MessagesFeed.js';
import { EventLog } from './EventLog.js';
import { TurnControls } from './TurnControls.js';

export class OverseersPanel {
  constructor(callbacks) {
    this.empireStats = new EmpireStats(document.getElementById('empire-stats'));
    this.reasoningLog = new ReasoningLog(document.getElementById('reasoning-log'));
    this.diplomacyFeed = new DiplomacyFeed(document.getElementById('diplomacy-feed'));
    this.messagesFeed = new MessagesFeed(document.getElementById('messages-feed'));
    this.eventLog = new EventLog(document.getElementById('event-log'));
    this.turnControls = new TurnControls(
      document.getElementById('turn-controls'),
      callbacks.onAdvance,
      callbacks.onToggleAuto,
      callbacks.saveCallbacks || {},
    );

    this._bindEvents();
    this._initResizeHandles();
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

  _initResizeHandles() {
    const panelHandle = document.getElementById('resize-panel');
    const bottomHandle = document.getElementById('resize-bottom');
    const rightPanel = document.getElementById('right-panel');
    const bottomBar = document.getElementById('bottom-bar');

    if (panelHandle && rightPanel) {
      this._makeDraggable(panelHandle, 'col', (delta) => {
        const current = rightPanel.offsetWidth;
        const next = Math.max(260, Math.min(700, current - delta));
        rightPanel.style.width = next + 'px';
      });
    }

    if (bottomHandle && bottomBar) {
      this._makeDraggable(bottomHandle, 'row', (delta) => {
        const current = bottomBar.offsetHeight;
        const next = Math.max(100, Math.min(400, current - delta));
        bottomBar.style.height = next + 'px';
      });
    }

    document.querySelectorAll('.panel-resize').forEach(handle => {
      const aboveId = handle.dataset.above;
      const belowId = handle.dataset.below;
      const above = document.getElementById(aboveId);
      const below = document.getElementById(belowId);
      if (!above || !below) return;

      this._makeDraggable(handle, 'row', (delta) => {
        const aboveH = above.offsetHeight + delta;
        const belowH = below.offsetHeight - delta;
        if (aboveH < 50 || belowH < 50) return;
        above.style.flex = 'none';
        below.style.flex = 'none';
        above.style.height = aboveH + 'px';
        below.style.height = belowH + 'px';
      });
    });

    const bottomSplitHandle = document.getElementById('resize-bottom-split');
    const turnControls = document.getElementById('turn-controls');
    const eventLogArea = document.getElementById('event-log-area');

    if (bottomSplitHandle && turnControls && eventLogArea) {
      this._makeDraggable(bottomSplitHandle, 'col', (delta) => {
        const current = turnControls.offsetWidth;
        const next = Math.max(260, Math.min(600, current + delta));
        turnControls.style.minWidth = next + 'px';
        turnControls.style.width = next + 'px';
      });
    }
  }

  _makeDraggable(handle, direction, onDrag) {
    let startPos = 0;
    const prop = direction === 'col' ? 'clientX' : 'clientY';

    const onMove = (e) => {
      const delta = e[prop] - startPos;
      startPos = e[prop];
      onDrag(delta);
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.dispatchEvent(new Event('resize'));
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startPos = e[prop];
      handle.classList.add('active');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = direction === 'col' ? 'col-resize' : 'row-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  updateState(gameState) {
    this.gameState = gameState;
    this.empireStats.update(gameState);
    this.diplomacyFeed.update(gameState);
    this.messagesFeed.update(gameState);
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
