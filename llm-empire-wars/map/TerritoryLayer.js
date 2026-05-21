import { getTerritoryStyle, getHighlightStyle } from './MapTheme.js';

export class TerritoryLayer {
  constructor(map) {
    this.map = map;
    this.layer = null;
    this.gameState = null;
    this.tooltip = document.getElementById('territory-tooltip');
  }

  setData(geojson) {
    if (this.layer) {
      this.map.removeLayer(this.layer);
    }
    this.geojson = geojson;
    this.layer = L.geoJSON(geojson, {
      style: (feature) => this._getStyle(feature),
      onEachFeature: (feature, layer) => this._bindEvents(feature, layer),
    }).addTo(this.map);
  }

  updateOwnership(gameState) {
    this.gameState = gameState;
    if (!this.layer) return;
    this.layer.eachLayer((layer) => {
      const feature = layer.feature;
      const style = this._getStyle(feature);
      layer.setStyle(style);
    });
  }

  _getStyle(feature) {
    if (!this.gameState) return getTerritoryStyle(null);
    const tid = feature.properties.id;
    const territory = this.gameState.territories[tid];
    if (!territory || !territory.ownerId) return getTerritoryStyle(null);
    const empire = this.gameState.empires[territory.ownerId];
    return getTerritoryStyle(empire);
  }

  _bindEvents(feature, layer) {
    layer.on('mouseover', (e) => {
      const empire = this._getEmpireForFeature(feature);
      layer.setStyle(getHighlightStyle(empire));
      layer.bringToFront();
      this._showTooltip(e, feature);
    });

    layer.on('mouseout', () => {
      layer.setStyle(this._getStyle(feature));
      this._hideTooltip();
    });

    layer.on('mousemove', (e) => {
      this._moveTooltip(e);
    });

    layer.on('click', () => {
      const tid = feature.properties.id;
      document.dispatchEvent(new CustomEvent('empire-wars:territory-clicked', {
        detail: { territoryId: tid },
      }));
    });
  }

  _getEmpireForFeature(feature) {
    if (!this.gameState) return null;
    const tid = feature.properties.id;
    const territory = this.gameState.territories[tid];
    if (!territory || !territory.ownerId) return null;
    return this.gameState.empires[territory.ownerId];
  }

  _showTooltip(e, feature) {
    if (!this.gameState) return;
    const tid = feature.properties.id;
    const territory = this.gameState.territories[tid];
    if (!territory) return;

    const empire = territory.ownerId ? this.gameState.empires[territory.ownerId] : null;
    const armies = Object.values(this.gameState.armies).filter(a => a.locationId === tid);

    let html = `<div class="tooltip-name">${territory.name}</div>`;
    html += `<div class="tooltip-owner" style="color: ${empire ? empire.color : '#888'}">`;
    html += empire ? empire.name : 'Neutral';
    html += `</div>`;
    html += `<div class="tooltip-resources">`;
    html += `<span>Food: ${territory.resources.food}</span>`;
    html += `<span>Prod: ${territory.resources.production}</span>`;
    html += `<span>Gold: ${territory.resources.gold}</span>`;
    html += `</div>`;
    if (territory.terrain) {
      html += `<div style="color: var(--ink-tertiary); font-size: 11px; margin-top: 4px;">Terrain: ${territory.terrain}</div>`;
    }
    const buildingNames = Object.keys(territory.buildings || {}).filter(b => territory.buildings[b]);
    if (buildingNames.length > 0) {
      html += `<div style="color: var(--ink-tertiary); font-size: 11px; margin-top: 4px;">Buildings: ${buildingNames.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(', ')}</div>`;
    }
    if (armies.length > 0) {
      html += `<div style="margin-top: 4px; font-size: 12px;">`;
      armies.forEach(a => {
        const ae = this.gameState.empires[a.empireId];
        html += `<span style="color: ${ae.color}">Army: ${a.size} units</span> `;
      });
      html += `</div>`;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    const container = this.map.getContainer();
    const rect = container.getBoundingClientRect();
    let x = e.originalEvent.clientX - rect.left + 15;
    let y = e.originalEvent.clientY - rect.top + 15;
    if (x + 260 > rect.width) x = x - 280;
    if (y + 150 > rect.height) y = y - 160;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  _hideTooltip() {
    this.tooltip.classList.add('hidden');
  }
}
