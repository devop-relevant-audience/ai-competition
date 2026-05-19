export const MAP_CONFIG = {
  tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  europeCenter: [54, 15],
  europeZoom: 4,
  minZoom: 3,
  maxZoom: 7,
  maxBounds: [[30, -25], [72, 50]],
};

export const NEUTRAL_COLOR = '#2c2c2c';
export const BORDER_COLOR = '#1a1a2e';

export function getTerritoryStyle(empire) {
  return {
    fillColor: empire ? empire.color : NEUTRAL_COLOR,
    fillOpacity: 0.55,
    color: BORDER_COLOR,
    weight: 1.5,
  };
}

export function getHighlightStyle(empire) {
  return {
    fillColor: empire ? empire.color : '#444466',
    fillOpacity: 0.75,
    color: '#e8e8f0',
    weight: 2.5,
  };
}
