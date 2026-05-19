import { createInitialState } from './engine/GameState.js';
import { GameEngine } from './engine/GameEngine.js';
import { AIController } from './ai/AIController.js';
import { OpenRouterConfig } from './ai/OpenRouterClient.js';
import { MapController } from './map/MapController.js';
import { OverseersPanel } from './ui/OverseersPanel.js';
import { EMPIRE_DEFINITIONS } from './data/empires.js';

class App {
  constructor() {
    this.gameState = null;
    this.engine = new GameEngine();
    this.aiController = new AIController();
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
    const errorEl = document.getElementById('setup-error');

    apiKeyInput.addEventListener('input', () => {
      startBtn.disabled = apiKeyInput.value.trim().length < 10;
      errorEl.textContent = '';
    });

    startBtn.addEventListener('click', () => this._startGame());
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

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    this.gameState = createInitialState({ turnLimit });

    this.mapController = new MapController('map');
    await this.mapController.loadGeoJSON('data/europe.geojson');

    this.panel = new OverseersPanel({
      onAdvance: () => this._advanceTurn(),
      onToggleAuto: (auto) => this._toggleAuto(auto),
    });

    this.mapController.updateState(this.gameState);
    this.panel.updateState(this.gameState);
    this.panel.setPhase('awaiting_advance');
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
}

window.addEventListener('DOMContentLoaded', () => new App());
