export const MAP_PRESETS = {
  europe: {
    label: 'Europe',
    description: '37 territories, 6 empires',
    regions: ['europe'],
    mapCenter: [54, 15],
    mapZoom: 4,
    maxBounds: [[30, -25], [72, 50]],
  },
  europe_middle_east: {
    label: 'Europe + Middle East',
    description: '50 territories, 8 empires',
    regions: ['europe', 'middle_east'],
    mapCenter: [38, 30],
    mapZoom: 4,
    maxBounds: [[10, -25], [72, 65]],
  },
  full: {
    label: 'Europe + Asia',
    description: '75 territories, 11 empires',
    regions: ['europe', 'middle_east', 'asia'],
    mapCenter: [35, 65],
    mapZoom: 3,
    maxBounds: [[-15, -25], [72, 155]],
  },
};

export const DEFAULT_PRESET = 'europe';
