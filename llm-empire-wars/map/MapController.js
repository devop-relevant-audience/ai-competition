import { MAP_CONFIG } from './MapTheme.js';
import { TerritoryLayer } from './TerritoryLayer.js';
import { ArmyLayer } from './ArmyLayer.js';

export class MapController {
  constructor(containerId) {
    this.map = L.map(containerId, {
      center: MAP_CONFIG.europeCenter,
      zoom: MAP_CONFIG.europeZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      maxBoundsViscosity: 0.8,
      zoomControl: true,
      attributionControl: true,
    });

    this.map.createPane('labels');
    this.map.getPane('labels').style.zIndex = 450;
    this.map.getPane('labels').style.pointerEvents = 'none';

    L.tileLayer(MAP_CONFIG.baseTileUrl, {
      attribution: MAP_CONFIG.tileAttribution,
      subdomains: 'abcd',
    }).addTo(this.map);

    L.tileLayer(MAP_CONFIG.labelsTileUrl, {
      attribution: '',
      subdomains: 'abcd',
      pane: 'labels',
    }).addTo(this.map);

    this.territoryLayer = new TerritoryLayer(this.map);
    this.armyLayer = new ArmyLayer(this.map);
  }

  async loadGeoJSON(url) {
    const response = await fetch(url);
    const geojson = await response.json();
    this.territoryLayer.setData(geojson);
    return geojson;
  }

  updateState(gameState) {
    this.territoryLayer.updateOwnership(gameState);
    this.armyLayer.updateArmies(gameState);
  }

  animateMovements(movements, gameState) {
    this.armyLayer.animateMovements(movements, gameState);
  }
}
