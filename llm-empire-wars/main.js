import { createInitialState } from './engine/GameState.js';
import { GameEngine } from './engine/GameEngine.js';
import { AIController } from './ai/AIController.js';
import { OpenRouterConfig } from './ai/OpenRouterClient.js';
import { MapController } from './map/MapController.js';
import { OverseersPanel } from './ui/OverseersPanel.js';
import { SaveManager } from './engine/SaveManager.js';
import { EMPIRE_DEFINITIONS } from './data/empires.js';

class App {
  constructor() {
    this.gameState = null;
    this.engine = new GameEngine();
    this.aiController = new AIController();
    this.saveManager = new SaveManager();
    this.mapController = null;
    this.panel = null;
    this.autoTimer = null;
    this.isRunning = false;

    this._initSetupScreen();
  }

  _initSetupScreen() {
    const empireContainer = document.getElementById('setup-empires');
    empireContainer.innerHTML = EMPIRE_DEFINITIONS.map(e => `
      <div class="empire-preview">
        <div class="empire-color-dot" style="background:${e.color}"></div>
        <span class="empire-preview-name" style="color:${e.color}">${e.name}</span>
        <span class="empire-preview-personality">${e.personality.replace(/_/g, ' ')}</span>
      </div>
    `).join('');

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

    if (this.saveManager.hasAnySave()) {
      const auto = this.saveManager.loadAutoSave();
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
  }

  async _startGame() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const turnLimit = parseInt(document.getElementById('turn-limit-input').value, 10) || 50;
    const errorEl = document.getElementById('setup-error');

    if (!apiKey) {
      errorEl.textContent = 'Please enter your OpenRouter API key.';
      return;
    }

    OpenRouterConfig.apiKey = apiKey;
    this.saveManager.saveApiKey(apiKey);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    this.gameState = createInitialState({ turnLimit });

    await this._initGameUI();
  }

  async _continueGame() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const errorEl = document.getElementById('setup-error');

    if (!apiKey) {
      errorEl.textContent = 'Please enter your OpenRouter API key to continue.';
      return;
    }

    const record = this.saveManager.loadAutoSave();
    if (!record) {
      errorEl.textContent = 'Save data is corrupt or missing.';
      return;
    }

    OpenRouterConfig.apiKey = apiKey;
    this.saveManager.saveApiKey(apiKey);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    this.gameState = record.gameState;

    await this._initGameUI();
  }

  async _resumeFromRecord(record) {
    this.gameState = record.gameState;
    this.mapController.updateState(this.gameState);
    this.panel.updateState(this.gameState);
    this.panel.setPhase('awaiting_advance');
  }

  async _initGameUI() {
    this.mapController = new MapController('map');
    await this.mapController.loadGeoJSON('data/europe.geojson');

    this.panel = new OverseersPanel({
      onAdvance: () => this._advanceTurn(),
      onToggleAuto: (auto) => this._toggleAuto(auto),
      saveCallbacks: {
        onSave: () => this._openSaveModal(),
        onLoad: () => this._openLoadModal(),
        onExport: () => this._exportGame(),
        onImport: (file) => this._importGame(file),
      },
    });

    this.mapController.updateState(this.gameState);
    this.panel.updateState(this.gameState);
    this.panel.setPhase('awaiting_advance');

    this._initModalClose();
  }

  async _advanceTurn() {
    if (this.isRunning) return;
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

      const { newState, events, movements } = this.engine.resolveTurn(this.gameState);

      if (movements.length > 0) {
        this.mapController.animateMovements(movements, newState);
      }

      this.gameState = newState;
      this.mapController.updateState(this.gameState);
      this.panel.updateState(this.gameState);
      this.panel.setPhase('awaiting_advance');

      this.saveManager.autoSave(this.gameState);

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

  _showGameOver(win) {
    clearTimeout(this.autoTimer);
    this.autoTimer = null;

    const overlay = document.getElementById('game-over-overlay');
    const title = document.getElementById('game-over-title');
    const subtitle = document.getElementById('game-over-subtitle');
    const stats = document.getElementById('game-over-stats');

    const reasons = {
      domination: 'achieved total domination of Europe!',
      turn_limit: 'controls the most territory as time runs out!',
      last_standing: 'is the last empire standing!',
    };

    title.innerHTML = `<span style="color:${win.winner.color}">${win.winner.name}</span> Wins!`;
    subtitle.textContent = `${win.winner.name} ${reasons[win.reason] || 'wins!'}`;

    const empires = Object.values(this.gameState.empires).sort((a, b) => {
      const aT = Object.values(this.gameState.territories).filter(t => t.ownerId === a.id).length;
      const bT = Object.values(this.gameState.territories).filter(t => t.ownerId === b.id).length;
      return bT - aT;
    });

    stats.innerHTML = empires.map(e => {
      const territories = Object.values(this.gameState.territories).filter(t => t.ownerId === e.id).length;
      return `
        <div class="game-over-stat">
          <div class="empire-stat-color" style="background:${e.color}"></div>
          <span style="color:${e.color};font-weight:600;flex:1">${e.name}</span>
          <span style="color:var(--text-secondary)">🏰 ${territories} territories</span>
          <span style="color:var(--text-secondary)">💰 ${e.treasury}g</span>
          ${e.isEliminated ? '<span style="color:var(--danger)">ELIMINATED</span>' : ''}
        </div>`;
    }).join('');

    overlay.classList.remove('hidden');

    document.getElementById('restart-btn').addEventListener('click', () => {
      window.location.reload();
    });
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

  _openSaveModal() {
    if (this.isRunning) return;
    const modal = document.getElementById('save-load-modal');
    const title = document.getElementById('modal-title');
    const slotsEl = document.getElementById('modal-slots');

    title.textContent = 'Save Game';
    const saves = this.saveManager.listSaves();
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
      btn.addEventListener('click', () => {
        const slot = parseInt(btn.dataset.saveSlot, 10);
        this.saveManager.saveToSlot(slot, this.gameState);
        modal.classList.add('hidden');
      });
    });

    modal.classList.remove('hidden');
  }

  _openLoadModal() {
    if (this.isRunning) return;
    const modal = document.getElementById('save-load-modal');
    const title = document.getElementById('modal-title');
    const slotsEl = document.getElementById('modal-slots');

    title.textContent = 'Load Game';
    const saves = this.saveManager.listSaves();

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
      btn.addEventListener('click', () => {
        const slot = parseInt(btn.dataset.loadSlot, 10);
        const type = btn.dataset.loadType;
        const record = type === 'autosave'
          ? this.saveManager.loadAutoSave()
          : this.saveManager.loadFromSlot(slot);
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
}

window.addEventListener('DOMContentLoaded', () => new App());
