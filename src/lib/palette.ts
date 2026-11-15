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
  selectionHalo: "#4d9b8a",
  pinVisited: "#000000",
  pinNotVisited: "#fdfffa",
  pinUnknown: "#254651",
  pinOutline: "#6c8c91",
  pinSelectedOutline: "#fdfffa",
  sky: "#f3f7f2",
  horizon: "#b4dce0",
} as const;

// Date labels, year filters and globe stripes share one year-to-color mapping.
// A stripe override lets the globe use a brighter shade of the same year color.
export const VISIT_YEAR_PALETTE: Readonly<
  Record<
    string,
    {
      date: string;
      globeStripe?: string | null;
    }
  >
> = {
  2026: { date: "#26784f", globeStripe: null },
  2025: { date: "#dfbf00", globeStripe: "#ffff00" },
  2024: { date: "#e67e00" },
  2023: { date: "#733900" },
};

export const VISIT_YEAR_COLORS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(VISIT_YEAR_PALETTE).map(([year, color]) => [
      year,
      color.date,
    ]),
  );

export const COUNTRY_STRIPE_COLORS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(VISIT_YEAR_PALETTE).flatMap(([year, color]) =>
      color.globeStripe === null
        ? []
        : [[year, color.globeStripe ?? color.date]],
    ),
  );
