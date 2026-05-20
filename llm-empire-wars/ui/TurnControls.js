const SPEED_MAP = {
  1: { label: 'Slow', delay: 8000 },
  2: { label: 'Normal', delay: 4000 },
  3: { label: 'Fast', delay: 1500 },
  4: { label: 'Blitz', delay: 500 },
};

export class TurnControls {
  constructor(container, onAdvance, onToggleAuto, saveCallbacks = {}) {
    this.container = container;
    this.onAdvance = onAdvance;
    this.onToggleAuto = onToggleAuto;
    this.onSave = saveCallbacks.onSave || (() => {});
    this.onLoad = saveCallbacks.onLoad || (() => {});
    this.onExport = saveCallbacks.onExport || (() => {});
    this.onImport = saveCallbacks.onImport || (() => {});
    this.autoPlay = false;
    this.speed = 2;
    this.isProcessing = false;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="turn-info">
        <span class="turn-number" id="turn-number">Turn 1</span>
        <span class="turn-phase" id="turn-phase">Ready</span>
        <span class="turn-phase" id="turn-limit"></span>
      </div>
      <button class="ctrl-btn" id="btn-advance">▶ Next Turn</button>
      <button class="ctrl-btn" id="btn-auto">Auto</button>
      <div class="speed-control">
        <span>Speed:</span>
        <input type="range" min="1" max="4" value="2" id="speed-slider" />
        <span id="speed-label">Normal</span>
      </div>
      <div class="save-controls">
        <button class="ctrl-btn ctrl-btn-save" id="btn-save" title="Save Game">Save</button>
        <button class="ctrl-btn ctrl-btn-save" id="btn-load" title="Load Game">Load</button>
        <button class="ctrl-btn ctrl-btn-save" id="btn-export" title="Export to File">Export</button>
        <label class="ctrl-btn ctrl-btn-save" id="btn-import-label" title="Import from File">
          Import
          <input type="file" id="file-import" accept=".json" hidden />
        </label>
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
      this.btnAuto.textContent = this.autoPlay ? '⏸ Pause' : 'Auto';
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
  }

  getDelay() {
    return SPEED_MAP[this.speed].delay;
  }

  updateState(gameState) {
    this.turnNumber.textContent = `Turn ${gameState.meta.turn}`;
    this.turnLimit.textContent = `/ ${gameState.meta.turnLimit}`;
  }

  setPhase(phase) {
    const labels = {
      ai_thinking: 'AI Thinking...',
      resolution: 'Resolving...',
      awaiting_advance: 'Ready',
    };
    this.turnPhase.textContent = labels[phase] || phase;
    this.isProcessing = phase !== 'awaiting_advance';
    this.btnAdvance.disabled = this.isProcessing;
  }
}
