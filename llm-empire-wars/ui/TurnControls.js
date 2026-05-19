const SPEED_MAP = {
  1: { label: 'Slow', delay: 8000 },
  2: { label: 'Normal', delay: 4000 },
  3: { label: 'Fast', delay: 1500 },
  4: { label: 'Blitz', delay: 500 },
};

export class TurnControls {
  constructor(container, onAdvance, onToggleAuto) {
    this.container = container;
    this.onAdvance = onAdvance;
    this.onToggleAuto = onToggleAuto;
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
