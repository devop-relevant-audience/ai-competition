import { createInitialState } from './engine/GameState.js';
import { GameEngine } from './engine/GameEngine.js';
import { AIController } from './ai/AIController.js';
import { DeepSeekConfig } from './ai/OpenRouterClient.js';
import { MapController } from './map/MapController.js';
import { OverseersPanel } from './ui/OverseersPanel.js';
import { DiplomacyEditor } from './ui/DiplomacyEditor.js';
import { SaveManager } from './engine/SaveManager.js';
import { StatsTracker } from './engine/StatsTracker.js';
import { GameOverAnalytics } from './ui/AnalyticsPanel.js';
import { GameReporter } from './engine/GameReporter.js';
import { MetaStatsStore } from './engine/MetaStatsStore.js';
import { BalanceDashboard } from './ui/BalanceDashboard.js';
import { EMPIRE_DEFINITIONS } from './data/empires.js';
import { RESOURCE_DEFS, RESOURCE_IDS } from './data/resources.js';
import { MAP_PRESETS, DEFAULT_PRESET } from './data/regions.js';

class App {
  constructor() {
    this.gameState = null;
    this.engine = new GameEngine();
    this.aiController = new AIController();
    this.saveManager = new SaveManager();
    this.statsTracker = new StatsTracker();
    this.gameOverAnalytics = new GameOverAnalytics();
    this.gameReporter = new GameReporter();
    this.metaStore = new MetaStatsStore();
    this.balanceDashboard = null;
    this.mapController = null;
    this.panel = null;
    this.diplomacyEditor = null;
    this.autoTimer = null;
    this.isRunning = false;

    this.viewingHistory = false;
    this._initSetupScreen();
  }

  async _initSetupScreen() {
    this.selectedPreset = DEFAULT_PRESET;

    const presetContainer = document.getElementById('map-preset-selector');
    presetContainer.innerHTML = Object.entries(MAP_PRESETS).map(([key, preset]) => `
      <button class="preset-btn${key === DEFAULT_PRESET ? ' active' : ''}" data-preset="${key}">
        <span class="preset-label">${preset.label}</span>
        <span class="preset-desc">${preset.description}</span>
      </button>
    `).join('');

    presetContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      this.selectedPreset = btn.dataset.preset;
      presetContainer.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._updateEmpirePreview();
    });

    this._updateEmpirePreview();

    const apiKeyInput = document.getElementById('api-key-input');
    const startBtn = document.getElementById('start-game-btn');
    const continueBtn = document.getElementById('continue-game-btn');
    const continueInfo = document.getElementById('continue-save-info');
    const errorEl = document.getElementById('setup-error');

    const savedKey = this.saveManager.loadApiKey();
    if (savedKey) {
      apiKeyInput.value = savedKey;
      startBtn.disabled = false;
    }

    if (await this.saveManager.hasAnySave()) {
      const auto = await this.saveManager.loadAutoSave();
      if (auto) {
        continueBtn.classList.remove('hidden');
        continueInfo.classList.remove('hidden');
        const d = new Date(auto.savedAt);
        continueInfo.textContent = `Turn ${auto.gameState.meta.turn} — saved ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      }
    }

    apiKeyInput.addEventListener('input', () => {
      startBtn.disabled = apiKeyInput.value.trim().length < 10;
      errorEl.textContent = '';
    });

    startBtn.addEventListener('click', () => this._startGame());
    continueBtn.addEventListener('click', () => this._continueGame());

    const balanceBtn = document.getElementById('setup-balance-btn');
    if (balanceBtn) {
      balanceBtn.addEventListener('click', () => {
        if (!this._setupBalanceDashboard) {
          this._setupBalanceDashboard = new BalanceDashboard(
            document.getElementById('balance-modal'),
            this.metaStore,
          );
        }
        this._setupBalanceDashboard.open();
      });
    }
  }

  _updateEmpirePreview() {
    const preset = MAP_PRESETS[this.selectedPreset];
    const activeRegions = preset.regions;
    const empireContainer = document.getElementById('setup-empires');
    const filtered = EMPIRE_DEFINITIONS.filter(e => activeRegions.includes(e.region));
    empireContainer.innerHTML = filtered.map(e => `
      <div class="empire-preview">
        <div class="empire-color-dot" style="background:${e.color}"></div>
        <span class="empire-preview-name" style="color:${e.color}">${e.name}</span>
        <span class="empire-preview-model">${e.model.split('/').pop()}</span>
      </div>
    `).join('');
  }

  async _startGame() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const turnLimit = parseInt(document.getElementById('turn-limit-input').value, 10) || 50;
    const errorEl = document.getElementById('setup-error');

    if (!apiKey) {
      errorEl.textContent = 'Please enter your DeepSeek API key.';
      return;
    }

    DeepSeekConfig.apiKey = apiKey;
    this.saveManager.saveApiKey(apiKey);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    const preset = MAP_PRESETS[this.selectedPreset];
    this.gameState = createInitialState({ turnLimit, regions: preset.regions, presetKey: this.selectedPreset });

    this.statsTracker = new StatsTracker();
    this.statsTracker.recordTurn(this.gameState, []);

    await this._initGameUI(preset);
  }

  async _continueGame() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const errorEl = document.getElementById('setup-error');

    if (!apiKey) {
      errorEl.textContent = 'Please enter your DeepSeek API key to continue.';
      return;
    }

    const record = await this.saveManager.loadAutoSave();
    if (!record) {
      errorEl.textContent = 'Save data is corrupt or missing.';
      return;
    }

    DeepSeekConfig.apiKey = apiKey;
    this.saveManager.saveApiKey(apiKey);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    this.gameState = record.gameState;
    const presetKey = record.gameState.meta.presetKey || 'europe';
    const preset = MAP_PRESETS[presetKey] || MAP_PRESETS.europe;

    this.statsTracker = new StatsTracker();
    this.statsTracker.rebuildFromState(this.gameState);

    await this._initGameUI(preset);
  }

  async _resumeFromRecord(record) {
    this.gameState = record.gameState;
    this.statsTracker.rebuildFromState(this.gameState);
    this.mapController.updateState(this.gameState);
    this.panel.updateState(this.gameState);
    this.panel.setPhase('awaiting_advance');
  }

  async _initGameUI(preset) {
    this.mapController = new MapController('map', preset);
    await this.mapController.loadGeoJSON('data/europe.geojson', preset.regions);

    this.panel = new OverseersPanel({
      onAdvance: () => this._advanceTurn(),
      onToggleAuto: (auto) => this._toggleAuto(auto),
      saveCallbacks: {
        onSave: () => this._openSaveModal(),
        onLoad: () => this._openLoadModal(),
        onExport: () => this._exportGame(),
        onImport: (file) => this._importGame(file),
      },
      extraCallbacks: {
        onEditDiplomacy: () => this._openDiplomacyEditor(),
        onHistorySeek: (turn) => this._viewHistoricalTurn(turn),
        onReturnToLive: () => this._returnToLive(),
      },
    });

    this.diplomacyEditor = new DiplomacyEditor((state) => {
      this.gameState = state;
      this.mapController.updateState(this.gameState);
      this.panel.updateState(this.gameState);
    });

    this.balanceDashboard = new BalanceDashboard(
      document.getElementById('balance-modal'),
      this.metaStore,
    );

    this.panel.setStatsTracker(this.statsTracker);
    this.mapController.updateState(this.gameState);
    this.panel.updateState(this.gameState);
    this.panel.setPhase('awaiting_advance');

    this._initModalClose();
  }

  _viewHistoricalTurn(turnNumber) {
    if (!this.gameState || !this.gameState.turnHistory) return;

    if (turnNumber >= this.gameState.meta.turn) {
      this._returnToLive();
      return;
    }

    const entry = this.gameState.turnHistory.find(h => h.turn === turnNumber);
    if (!entry) return;

    this.viewingHistory = true;

    const historicalState = {
      ...entry.snapshot,
      eventLog: entry.events || [],
      turnHistory: this.gameState.turnHistory,
    };

    this.panel.setHistoryView(true, turnNumber, this.gameState.meta.turn);
    this.mapController.updateState(historicalState);
    this.panel.updateState(historicalState);
  }

  _returnToLive() {
    if (!this.viewingHistory) return;
    this.viewingHistory = false;

    this.mapController.updateState(this.gameState);
    this.panel.updateState(this.gameState);
    this.panel.setHistoryView(false, this.gameState.meta.turn, this.gameState.meta.turn);
    this.panel.setPhase(this.gameState.meta.phase);
  }

  async _advanceTurn() {
    if (this.isRunning || this.viewingHistory) return;
    this.isRunning = true;

    try {
      const win = this.engine.checkWinCondition(this.gameState);
      if (win) {
        this._showGameOver(win);
        this.isRunning = false;
        return;
      }

      this.panel.setPhase('ai_thinking');
      this.gameState.meta.phase = 'ai_thinking';

      await this.aiController.runAITurn(this.gameState);

      this.panel.setPhase('resolution');
      this.gameState.meta.phase = 'resolution';

      this.statsTracker.stageActionCounts(this.gameState.pendingActions || {});
      const { newState, events, movements, missileFlights } = this.engine.resolveTurn(this.gameState);

      if (missileFlights && missileFlights.length > 0) {
        this.mapController.showMissileArcs(missileFlights, newState);
      }

      for (const ev of events) {
        if (ev.type !== 'battle' || !ev.territoryId) continue;
        const losses = [];
        for (const eId of (ev.winnerEmpireIds || [])) {
          if (eId !== 'neutral' && ev.winnerLoss > 0) losses.push({ empireId: eId, amount: ev.winnerLoss });
        }
        for (const eId of (ev.loserEmpireIds || [])) {
          if (eId !== 'neutral' && ev.loserLoss > 0) losses.push({ empireId: eId, amount: ev.loserLoss });
        }
        if (losses.length > 0) {
          this.mapController.showCombatText(ev.territoryId, losses, newState);
        }
      }

      if (movements.length > 0) {
        this.mapController.animateMovements(movements, newState);
      }

      this.gameState = newState;
      this.statsTracker.recordTurn(this.gameState, events);
      this.mapController.updateState(this.gameState);
      this.panel.updateState(this.gameState);
      this.panel.setPhase('awaiting_advance');

      await this.saveManager.autoSave(this.gameState);

      const postWin = this.engine.checkWinCondition(this.gameState);
      if (postWin) {
        this._showGameOver(postWin);
      }
    } catch (err) {
      console.error('Turn error:', err);
      this.panel.setPhase('awaiting_advance');
    }

    this.isRunning = false;

    if (this.panel.isAutoPlay && !this.engine.checkWinCondition(this.gameState)) {
      this.autoTimer = setTimeout(() => this._advanceTurn(), this.panel.getAutoDelay());
    }
  }


  _toggleAuto(auto) {
    if (auto) {
      this._advanceTurn();
    } else {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  async _saveGameReport(winResult) {
    try {
      const report = this.gameReporter.generate(this.gameState, this.statsTracker, winResult);
      await this.metaStore.saveReport(report);
      console.log(`[Analytics] Game report saved: ${report.gameId} (${report.turnCount} turns, winner: ${report.winner?.empireName})`);
    } catch (err) {
      console.error('[Analytics] Failed to save game report:', err);
    }
  }

  _showGameOver(win) {
    clearTimeout(this.autoTimer);
    this.autoTimer = null;

    this._saveGameReport(win);

    const overlay = document.getElementById('game-over-overlay');
    const content = document.getElementById('game-over-content');

    this.gameOverAnalytics.destroy();
    this.gameOverAnalytics.render(content, this.statsTracker, this.gameState);

    overlay.classList.remove('hidden');

    const restartBtn = content.querySelector('#go-restart-btn');
    const reviewBtn = content.querySelector('#go-review-btn');

    if (restartBtn) {
      restartBtn.addEventListener('click', () => window.location.reload());
    }
    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    }
  }

  _initModalClose() {
    document.getElementById('modal-close-btn').addEventListener('click', () => {
      document.getElementById('save-load-modal').classList.add('hidden');
    });
    document.getElementById('save-load-modal').addEventListener('click', (e) => {
      if (e.target.id === 'save-load-modal') {
        e.target.classList.add('hidden');
      }
    });
  }

  async _openSaveModal() {
    if (this.isRunning) return;
    const modal = document.getElementById('save-load-modal');
    const title = document.getElementById('modal-title');
    const slotsEl = document.getElementById('modal-slots');

    title.textContent = 'Save Game';
    const saves = await this.saveManager.listSaves();
    const slots = saves.filter(s => s.type === 'slot');

    slotsEl.innerHTML = slots.map(s => {
      const info = s.label
        ? `${s.label} <span class="slot-date">${new Date(s.savedAt).toLocaleString()}</span>`
        : '<span class="slot-empty">Empty</span>';
      return `
        <div class="modal-slot">
          <div class="slot-info">${info}</div>
          <button class="btn-primary btn-sm" data-save-slot="${s.slot}">Save Here</button>
        </div>`;
    }).join('');

    slotsEl.querySelectorAll('[data-save-slot]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const slot = parseInt(btn.dataset.saveSlot, 10);
        await this.saveManager.saveToSlot(slot, this.gameState);
        modal.classList.add('hidden');
      });
    });

    modal.classList.remove('hidden');
  }

  async _openLoadModal() {
    if (this.isRunning) return;
    const modal = document.getElementById('save-load-modal');
    const title = document.getElementById('modal-title');
    const slotsEl = document.getElementById('modal-slots');

    title.textContent = 'Load Game';
    const saves = await this.saveManager.listSaves();

    slotsEl.innerHTML = saves
      .filter(s => s.label !== null)
      .map(s => {
        const label = s.type === 'autosave' ? `Auto-save` : s.label;
        const date = new Date(s.savedAt).toLocaleString();
        return `
          <div class="modal-slot">
            <div class="slot-info">${label} — Turn ${s.turn} <span class="slot-date">${date}</span></div>
            <button class="btn-primary btn-sm" data-load-slot="${s.slot}" data-load-type="${s.type}">Load</button>
          </div>`;
      }).join('');

    if (slotsEl.innerHTML.trim() === '') {
      slotsEl.innerHTML = '<p class="slot-empty">No saves found.</p>';
    }

    slotsEl.querySelectorAll('[data-load-slot]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const slot = parseInt(btn.dataset.loadSlot, 10);
        const type = btn.dataset.loadType;
        const record = type === 'autosave'
          ? await this.saveManager.loadAutoSave()
          : await this.saveManager.loadFromSlot(slot);
        if (record) {
          this._resumeFromRecord(record);
        }
        modal.classList.add('hidden');
      });
    });

    modal.classList.remove('hidden');
  }

  _exportGame() {
    if (this.isRunning) return;
    this.saveManager.exportToFile(this.gameState);
  }

  async _importGame(file) {
    if (this.isRunning) return;
    try {
      const record = await this.saveManager.importFromFile(file);
      this._resumeFromRecord(record);
    } catch (err) {
      console.error('Import failed:', err);
    }
  }

  _openDiplomacyEditor() {
    if (this.isRunning || !this.gameState) return;
    this.diplomacyEditor.open(this.gameState);
  }
}

window.addEventListener('DOMContentLoaded', () => new App());
