export class ReasoningLog {
  constructor(container) {
    this.container = container;
    this.entries = [];
    this.maxEntries = 9;
  }

  showThinking(empireId, gameState) {
    const empire = gameState.empires[empireId];
    if (!empire) return;

    const el = document.createElement('div');
    el.className = 'reasoning-thinking';
    el.style.borderLeftColor = empire.color;
    el.id = `thinking-${empireId}`;
    el.innerHTML = `
      <div class="spinner"></div>
      <span style="color:${empire.color};font-weight:600;font-size:12px">${this._escapeHtml(empire.name)}</span>
      <span style="color:var(--ink-tertiary)">thinking...</span>
    `;

    this.container.prepend(el);
  }

  showReasoning(empireId, reasoning, gameState, isError = false) {
    const thinkingEl = document.getElementById(`thinking-${empireId}`);
    if (thinkingEl) thinkingEl.remove();

    const empire = gameState.empires[empireId];
    if (!empire) return;

    const el = document.createElement('div');
    el.className = 'reasoning-bubble';
    el.style.borderLeftColor = empire.color;
    el.innerHTML = `
      <div class="reasoning-empire-name" style="color:${empire.color}">
        ${this._escapeHtml(empire.name)}
        ${isError ? '<span style="color:var(--danger);font-size:10px;font-weight:500;background:rgba(229,72,77,0.12);padding:1px 6px;border-radius:9999px">ERROR</span>' : ''}
      </div>
      <div class="reasoning-text">${this._escapeHtml(reasoning)}</div>
    `;

    this.entries.unshift(el);
    this.container.prepend(el);

    while (this.entries.length > this.maxEntries) {
      const old = this.entries.pop();
      old.remove();
    }
  }

  clear() {
    this.container.innerHTML = '';
    this.entries = [];
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
