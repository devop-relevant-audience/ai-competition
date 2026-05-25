const SPEED_MAP = {
  1: { label: 'Slow', delay: 8000 },
  2: { label: 'Normal', delay: 4000 },
  3: { label: 'Fast', delay: 1500 },
  4: { label: 'Blitz', delay: 500 },
};

export class TurnControls {
  constructor(container, onAdvance, onToggleAuto, saveCallbacks = {}, extraCallbacks = {}) {
    this.container = container;
    this.onAdvance = onAdvance;
    this.onToggleAuto = onToggleAuto;
    this.onSave = saveCallbacks.onSave || (() => {});
    this.onLoad = saveCallbacks.onLoad || (() => {});
    this.onExport = saveCallbacks.onExport || (() => {});
    this.onImport = saveCallbacks.onImport || (() => {});
    this.onEditDiplomacy = extraCallbacks.onEditDiplomacy || (() => {});
    this.onOpenAnalytics = extraCallbacks.onOpenAnalytics || (() => {});
    this.onOpenBalance = extraCallbacks.onOpenBalance || (() => {});
    this.onOpenMarket = extraCallbacks.onOpenMarket || (() => {});
    this.onHistorySeek = extraCallbacks.onHistorySeek || (() => {});
    this.onReturnToLive = extraCallbacks.onReturnToLive || (() => {});
    this.autoPlay = false;
    this.speed = 2;
    this.isProcessing = false;
    this.historyViewActive = false;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="turn-info">
        <span class="turn-number" id="turn-number">Turn 1</span>
        <span class="turn-limit" id="turn-limit"></span>
        <span class="turn-phase" id="turn-phase">
          <span class="phase-badge phase-ready">Ready</span>
        </span>
      </div>
      <button class="ctrl-btn ctrl-btn-advance" id="btn-advance">Next Turn</button>
      <button class="ctrl-btn" id="btn-auto">Auto</button>
      <div class="speed-control">
        <span>Speed</span>
        <input type="range" min="1" max="4" value="2" id="speed-slider" />
        <span class="speed-label" id="speed-label">Normal</span>
      </div>
      <div class="save-controls">
        <button class="ctrl-btn ctrl-btn-save" id="btn-save" title="Save Game">Save</button>
        <button class="ctrl-btn ctrl-btn-save" id="btn-load" title="Load Game">Load</button>
        <button class="ctrl-btn ctrl-btn-save" id="btn-export" title="Export to File">Export</button>
        <label class="ctrl-btn ctrl-btn-save" id="btn-import-label" title="Import from File">
          Import
          <input type="file" id="file-import" accept=".json" hidden />
        </label>
        <button class="ctrl-btn ctrl-btn-save ctrl-btn-diplo" id="btn-edit-diplomacy" title="Edit Empire Relations">Diplomacy</button>
        <button class="ctrl-btn ctrl-btn-save ctrl-btn-diplo" id="btn-analytics" title="Empire Analytics">Analytics</button>
        <button class="ctrl-btn ctrl-btn-save ctrl-btn-diplo" id="btn-balance" title="Balance Dashboard">Balance</button>
        <button class="ctrl-btn ctrl-btn-save ctrl-btn-market" id="btn-market" title="Commodities Exchange">Market</button>
      </div>
      <div class="history-slider hidden" id="history-slider-wrap">
        <div class="history-slider-row">
          <span class="history-slider-label" id="history-turn-label">Turn 1 / 1</span>
          <input type="range" min="1" max="1" value="1" id="history-slider" />
          <button class="ctrl-btn ctrl-btn-live hidden" id="btn-return-live">Live</button>
        </div>
      </div>
    `;

    this.btnAdvance = this.container.querySelector('#btn-advance');
    this.btnAuto = this.container.querySelector('#btn-auto');
    this.speedSlider = this.container.querySelector('#speed-slider');
    this.speedLabel = this.container.querySelector('#speed-label');
    this.turnNumber = this.container.querySelector('#turn-number');
    this.turnPhase = this.container.querySelector('#turn-phase');
    this.turnLimit = this.container.querySelector('#turn-limit');

    this.btnAdvance.addEventListener('click', () => {
      if (!this.isProcessing) this.onAdvance();
    });

    this.btnAuto.addEventListener('click', () => {
      this.autoPlay = !this.autoPlay;
      this.btnAuto.classList.toggle('active', this.autoPlay);
      this.btnAuto.textContent = this.autoPlay ? 'Pause' : 'Auto';
      this.onToggleAuto(this.autoPlay);
    });

    this.speedSlider.addEventListener('input', (e) => {
      this.speed = parseInt(e.target.value, 10);
      this.speedLabel.textContent = SPEED_MAP[this.speed].label;
    });

    this.container.querySelector('#btn-save').addEventListener('click', () => this.onSave());
    this.container.querySelector('#btn-load').addEventListener('click', () => this.onLoad());
    this.container.querySelector('#btn-export').addEventListener('click', () => this.onExport());
    this.container.querySelector('#file-import').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.onImport(e.target.files[0]);
        e.target.value = '';
      }
    });
    this.container.querySelector('#btn-edit-diplomacy').addEventListener('click', () => this.onEditDiplomacy());
    this.container.querySelector('#btn-analytics').addEventListener('click', () => this.onOpenAnalytics());
    this.container.querySelector('#btn-balance').addEventListener('click', () => this.onOpenBalance());
    this.container.querySelector('#btn-market').addEventListener('click', () => this.onOpenMarket());

    this.historySlider = this.container.querySelector('#history-slider');
    this.historySliderWrap = this.container.querySelector('#history-slider-wrap');
    this.historyTurnLabel = this.container.querySelector('#history-turn-label');
    this.btnReturnLive = this.container.querySelector('#btn-return-live');

    this.historySlider.addEventListener('input', (e) => {
      const turn = parseInt(e.target.value, 10);
      this.onHistorySeek(turn);
    });

    this.btnReturnLive.addEventListener('click', () => {
      this.onReturnToLive();
    });
  }

  getDelay() {
    return SPEED_MAP[this.speed].delay;
  }

  updateState(gameState) {
    this.turnNumber.textContent = `Turn ${gameState.meta.turn}`;
    this.turnLimit.textContent = `/ ${gameState.meta.turnLimit}`;

    if (this.historyViewActive) return;

    const historyLen = gameState.turnHistory ? gameState.turnHistory.length : 0;
    if (historyLen >= 2) {
      this.historySliderWrap.classList.remove('hidden');
      const maxTurn = gameState.meta.turn;
      this.historySlider.min = 1;
      this.historySlider.max = maxTurn;
      this.historySlider.value = maxTurn;
      this.historyTurnLabel.textContent = `Turn ${maxTurn} / ${maxTurn}`;
    } else {
      this.historySliderWrap.classList.add('hidden');
    }
  }

  setHistoryView(active, turnNumber, maxTurn) {
    this.historyViewActive = active;
    this.historySlider.min = 1;
    this.historySlider.max = maxTurn;
    if (active) {
      this.btnReturnLive.classList.remove('hidden');
      this.btnAdvance.disabled = true;
      this.btnAuto.disabled = true;
      this.historySlider.value = turnNumber;
      this.historyTurnLabel.textContent = `Turn ${turnNumber} / ${maxTurn}`;
    } else {
      this.btnReturnLive.classList.add('hidden');
      this.btnAdvance.disabled = this.isProcessing;
      this.btnAuto.disabled = false;
      this.historySlider.value = maxTurn;
      this.historyTurnLabel.textContent = `Turn ${maxTurn} / ${maxTurn}`;
    }
  }

  setPhase(phase) {
    const phases = {
      ai_thinking: '<span class="phase-badge phase-thinking"><span class="spinner"></span> AI Thinking</span>',
      resolution: '<span class="phase-badge phase-resolving">Resolving</span>',
      awaiting_advance: '<span class="phase-badge phase-ready">Ready</span>',
    };
    this.turnPhase.innerHTML = phases[phase] || phase;
    this.isProcessing = phase !== 'awaiting_advance';
    this.btnAdvance.disabled = this.isProcessing;
  }
}
