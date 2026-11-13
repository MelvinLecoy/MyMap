// The Coastal palette is shared by the bundled atlas and optional provider style.
// CSV colors remain explicit overrides of these defaults.
export const MAP_COLORS = {
  water: "#c5e4ec",
  land: "#edf0e6",
  visitedCountry: "#63b28a",
  boundary: "#6b7772",
  adminBoundary: "#a8bdb0",
  grid: "#a6c1bc",
  label: "#344f54",
  subdivisionLabel: "#506f70",
  labelHalo: "#f7faf0",
  cityLabel: "#213e4a",
  cityLabelHalo: "#fdfffa",
  clusterFill: "#fbfcf7",
  clusterStroke: "#6f9a92",
  clusterText: "#253f4c",
  clusterHalo: "#86c7b3",
  selectionHalo: "#4d9b8a",
  pinVisited: "#e4a53d",
  pinNotVisited: "#fdfffa",
  pinUnknown: "#254651",
  pinOutline: "#6c8c91",
  pinSelectedOutline: "#fdfffa",
  sky: "#f3f7f2",
  horizon: "#b4dce0",
} as const;

export const VISIT_YEAR_COLORS: Readonly<Record<string, string>> = {
  2026: "#26784f",
  2025: "#ffe600",
  2024: "#e67e00",
  2023: "#573122",
};

export const COUNTRY_STRIPE_COLORS: Readonly<Record<string, string>> = {
  2025: VISIT_YEAR_COLORS[2025],
  2024: VISIT_YEAR_COLORS[2024],
  2023: VISIT_YEAR_COLORS[2023],
};
