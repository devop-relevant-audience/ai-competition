const STATUSES = ['neutral', 'trade', 'alliance', 'war'];

export class DiplomacyEditor {
  constructor(onRelationChanged) {
    this.onRelationChanged = onRelationChanged;
    this.gameState = null;
    this.modal = null;
    this._createModal();
  }

  _createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'diplomacy-editor-modal';
    this.modal.className = 'modal-overlay hidden';
    this.modal.innerHTML = `
      <div class="modal-card diplo-editor-card">
        <h2>Edit Diplomacy</h2>
        <div class="diplo-editor-body" id="diplo-editor-body"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="diplo-editor-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.modal);

    this.modal.querySelector('#diplo-editor-close').addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open(gameState) {
    this.gameState = gameState;
    this._renderGrid();
    this.modal.classList.remove('hidden');
  }

  close() {
    this.modal.classList.add('hidden');
  }

  _renderGrid() {
    const body = this.modal.querySelector('#diplo-editor-body');
    const empires = this.gameState.empires;

    let html = '<div class="diplo-grid">';

    let idx = 0;
    for (const [key, rel] of Object.entries(this.gameState.relations)) {
      const eA = empires[rel.empireA];
      const eB = empires[rel.empireB];
      if (!eA || !eB || eA.isEliminated || eB.isEliminated) continue;

      const currentStatus = rel.status || 'neutral';
      const rowId = `diplo-row-${idx}`;

      html += `
        <div class="diplo-row" id="${rowId}">
          <span class="diplo-empire" style="color:${eA.color}">${this._escapeHtml(eA.name)}</span>
          <span class="diplo-arrow">↔</span>
          <span class="diplo-empire" style="color:${eB.color}">${this._escapeHtml(eB.name)}</span>
          <select class="diplo-select diplo-status-${currentStatus}" data-key="${key}" data-row="${rowId}">
            ${STATUSES.map(s => `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
          </select>
          <span class="diplo-confirm hidden" id="${rowId}-confirm">✓</span>
        </div>
      `;
      idx++;
    }

    html += '</div>';
    body.innerHTML = html;

    body.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', (e) => {
        const key = e.target.dataset.key;
        const rowId = e.target.dataset.row;
        const newStatus = e.target.value;
        this._applyStatus(key, newStatus, e.target, rowId);
      });
    });
  }

  _applyStatus(key, newStatus, selectEl, rowId) {
    const rel = this.gameState.relations[key];
    if (!rel) return;

    const oldStatus = rel.status;
    if (oldStatus === newStatus) return;

    rel.status = newStatus;

    if (newStatus === 'trade') {
      rel.tradeValue = 2;
    } else {
      rel.tradeValue = 0;
    }

    if (newStatus === 'war') {
      rel.pactExpiry = null;
    }

    if (oldStatus === 'war' && newStatus !== 'war') {
      rel.peaceCooldownUntil = null;
    }

    selectEl.className = `diplo-select diplo-status-${newStatus}`;

    const confirm = document.getElementById(`${rowId}-confirm`);
    if (confirm) {
      confirm.classList.remove('hidden');
      confirm.classList.add('diplo-flash');
      setTimeout(() => {
        confirm.classList.remove('diplo-flash');
        confirm.classList.add('hidden');
      }, 1500);
    }

    const row = document.getElementById(rowId);
    if (row) {
      row.classList.add('diplo-row-changed');
      setTimeout(() => row.classList.remove('diplo-row-changed'), 1000);
    }

    if (this.onRelationChanged) {
      this.onRelationChanged(this.gameState);
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
