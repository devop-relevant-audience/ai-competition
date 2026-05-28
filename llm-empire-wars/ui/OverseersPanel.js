import { EmpireStats } from './EmpireStats.js';
import { ReasoningLog } from './ReasoningLog.js';
import { DiplomacyFeed } from './DiplomacyFeed.js';
import { MessagesFeed } from './MessagesFeed.js';
import { EventLog } from './EventLog.js';
import { TurnControls } from './TurnControls.js';
import { AnalyticsPanel } from './AnalyticsPanel.js';
import { TechTreePanel } from './TechTreePanel.js';

export class OverseersPanel {
  constructor(callbacks) {
    this.empireStats = new EmpireStats(document.getElementById('empire-stats'));
    this.reasoningLog = new ReasoningLog(document.getElementById('reasoning-log'));
    this.diplomacyFeed = new DiplomacyFeed(document.getElementById('diplomacy-feed'));
    this.messagesFeed = new MessagesFeed(document.getElementById('messages-feed'));
    this.eventLog = new EventLog(document.getElementById('event-log'));
    this.analyticsPanel = new AnalyticsPanel(document.getElementById('analytics-modal'));
    this.techTreePanel = new TechTreePanel(document.getElementById('tech-tree'));
    const extraCb = callbacks.extraCallbacks || {};
    extraCb.onOpenAnalytics = () => this.analyticsPanel.open();
    extraCb.onOpenBalance = () => this._onOpenBalance && this._onOpenBalance();

    this.turnControls = new TurnControls(
      document.getElementById('turn-controls'),
      callbacks.onAdvance,
      callbacks.onToggleAuto,
      callbacks.saveCallbacks || {},
      extraCb,
    );

    this._initTabs();
    this._bindEvents();
    this._initResizeHandles();
  }

  _initTabs() {
    const tabs = document.querySelectorAll('.panel-tab');
    const contents = document.querySelectorAll('.panel-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const content = document.querySelector(`[data-tab-content="${target}"]`);
        if (content) content.classList.add('active');
      });
    });
  }

  _bindEvents() {
    document.addEventListener('empire-wars:ai-thinking', (e) => {
      this.gameState && this.reasoningLog.showThinking(e.detail.empireId, this.gameState);
      this._activateTab('reasoning');
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

  _activateTab(tabName) {
    const tab = document.querySelector(`.panel-tab[data-tab="${tabName}"]`);
    if (tab && !tab.classList.contains('active')) {
      tab.click();
    }
  }

  _initResizeHandles() {
    const panelHandle = document.getElementById('resize-panel');
    const rightPanel = document.getElementById('right-panel');

    if (panelHandle && rightPanel) {
      this._makeDraggable(panelHandle, 'col', (delta) => {
        const current = rightPanel.offsetWidth;
        const next = Math.max(280, Math.min(700, current - delta));
        rightPanel.style.width = next + 'px';
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

  setStatsTracker(tracker) {
    this.analyticsPanel.setTracker(tracker);
  }

  onOpenAnalytics(callback) {
    this._onOpenAnalytics = callback;
  }

  onOpenBalance(callback) {
    this._onOpenBalance = callback;
  }

  updateState(gameState) {
    this.gameState = gameState;
    this.empireStats.update(gameState);
    this.diplomacyFeed.update(gameState);
    this.messagesFeed.update(gameState);
    this.eventLog.update(gameState);
    this.analyticsPanel.update(gameState);
    this.techTreePanel.update(gameState);
    this.turnControls.updateState(gameState);
  }

  setPhase(phase) {
    this.turnControls.setPhase(phase);
  }

  getAutoDelay() {
    return this.turnControls.getDelay();
  }

  setHistoryView(active, turnNumber, maxTurn) {
    this.turnControls.setHistoryView(active, turnNumber, maxTurn);
  }

  get isAutoPlay() {
    return this.turnControls.autoPlay;
  }
}
