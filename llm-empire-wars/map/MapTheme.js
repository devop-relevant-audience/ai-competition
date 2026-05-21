export const MAP_CONFIG = {
  baseTileUrl: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
  labelsTileUrl: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  europeCenter: [38, 30],
  europeZoom: 4,
  minZoom: 3,
  maxZoom: 8,
  maxBounds: [[10, -25], [72, 65]],
};

export const NEUTRAL_COLOR = '#1a1b1e';
export const BORDER_COLOR = '#0a0a0c';

export function getTerritoryStyle(empire) {
  return {
    fillColor: empire ? empire.color : NEUTRAL_COLOR,
    fillOpacity: empire ? 0.35 : 0.25,
    color: empire ? lighten(empire.color, 0.2) : '#2a2b2f',
    weight: 1.2,
    dashArray: empire ? null : '3,3',
  };
}

export function getHighlightStyle(empire) {
  return {
    fillColor: empire ? empire.color : '#34363b',
    fillOpacity: empire ? 0.55 : 0.35,
    color: '#f7f8f8',
    weight: 1.8,
  };
}

function lighten(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
