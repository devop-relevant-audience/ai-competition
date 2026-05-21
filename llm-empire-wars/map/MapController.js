import { MAP_CONFIG } from './MapTheme.js';
import { TerritoryLayer } from './TerritoryLayer.js';
import { ArmyLayer } from './ArmyLayer.js';
import { TERRITORY_DATA } from '../data/territories.js';

export class MapController {
  constructor(containerId, preset) {
    this.map = L.map(containerId, {
      center: preset.mapCenter,
      zoom: preset.mapZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: preset.maxBounds,
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

  async loadGeoJSON(url, regions) {
    const response = await fetch(url);
    const geojson = await response.json();

    if (regions) {
      const activeIds = new Set(
        Object.entries(TERRITORY_DATA)
          .filter(([, data]) => regions.includes(data.region))
          .map(([tid]) => tid)
      );
      geojson.features = geojson.features.filter(f => activeIds.has(f.properties.id));
    }

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
