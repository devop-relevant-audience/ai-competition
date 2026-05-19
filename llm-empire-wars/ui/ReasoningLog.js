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
    el.innerHTML = `<div class="spinner"></div><span style="color:${empire.color}">${empire.name}</span> is thinking...`;

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
        ${empire.name}${isError ? ' <span style="color:var(--danger)">[ERROR]</span>' : ''}
      </div>
      <div>${this._escapeHtml(reasoning)}</div>
    `;

    this.entries.unshift(el);
    this.container.prepend(el);

    while (this.entries.length > this.maxEntries) {
      const old = this.entries.pop();
      old.style.opacity = '0.3';
      setTimeout(() => old.remove(), 500);
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
