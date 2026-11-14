import type { ExpressionSpecification, Map as MapInstance } from "maplibre-gl";
import { countryFillOpacity, fillColors } from "./map-style";
import { countryStripeLayers } from "./country-stripes";
import { MAP_COLORS } from "./palette";
import type { CountryVisit } from "./types";

const hovered: ExpressionSpecification = [
  "any",
  ["boolean", ["feature-state", "countryHover"], false],
  ["boolean", ["feature-state", "countrySelected"], false],
];
const transition = { duration: 0, delay: 0 };
const uniformPaintOptions = { validate: false };

export function restoreCountryPaint(
  map: MapInstance,
  countries: CountryVisit[],
) {
  if (!map.getLayer("atlas-land")) return;
  map.setPaintProperty("atlas-land", "fill-color", fillColors(countries));
  map.setPaintProperty(
    "atlas-land",
    "fill-opacity",
    countryFillOpacity(countries),
  );
  map.setPaintProperty("atlas-borders", "line-opacity", 0.9);
  for (const layer of countryStripeLayers(countries)) {
    map.setFilter(layer.id, layer.filter ?? null);
    map.setPaintProperty(layer.id, "fill-opacity", 1);
  }
}

/** A shared-source overlay: geographic hit areas and city layers stay fixed. */
function createHighlight(
  map: MapInstance,
  countries: CountryVisit[],
  beforeId: string | undefined,
  duration: (milliseconds: number) => number,
  kind: "hover" | "selected",
) {
  const flag = kind === "hover" ? "countryHover" : "countrySelected";
  const ownState: ExpressionSpecification = [
    "boolean",
    ["feature-state", flag],
    false,
  ];
  const onlyHovered = (
    value: number | ExpressionSpecification,
  ): ExpressionSpecification => ["case", ownState, value, 0];
  let active: string | null = null;
  let target: string | null = null;
  let progress = 0;
  let frame = 0;
  let disposed = false;
  const stripeIds = countryStripeLayers(countries).map(
    (layer) => `atlas-${kind}-${layer.id}`,
  );
  const fillIds = [`atlas-${kind}-land`, ...stripeIds];
  map.addLayer(
    {
      id: `atlas-${kind}-shadow`,
      type: "fill",
      source: "atlas-countries",
      paint: {
        "fill-color": "#173d3c",
        "fill-opacity": onlyHovered(0.12),
        "fill-translate": [0, 1],
        "fill-translate-anchor": "viewport",
        "fill-opacity-transition": transition,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: `atlas-${kind}-shadow-edge`,
      type: "line",
      source: "atlas-countries",
      paint: {
        "line-color": "#173d3c",
        "line-width": 3,
        "line-blur": 1.2,
        "line-opacity": onlyHovered(0.18),
        "line-translate": [0, 1],
        "line-translate-anchor": "viewport",
        "line-opacity-transition": transition,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: `atlas-${kind}-land`,
      type: "fill",
      source: "atlas-countries",
      paint: {
        "fill-color": fillColors(countries) as ExpressionSpecification,
        "fill-opacity": onlyHovered(countryFillOpacity(countries)),
        "fill-translate": [0, 0],
        "fill-translate-anchor": "viewport",
        "fill-translate-transition": transition,
        "fill-opacity-transition": transition,
      },
    },
    beforeId,
  );
  for (const layer of countryStripeLayers(countries)) {
    map.addLayer(
      {
        ...layer,
        id: `atlas-${kind}-${layer.id}`,
        paint: {
          ...layer.paint,
          "fill-opacity": onlyHovered(1),
          "fill-opacity-transition": transition,
          "fill-translate": [0, 0],
          "fill-translate-anchor": "viewport",
          "fill-translate-transition": transition,
        },
      },
      beforeId,
    );
  }
  map.addLayer(
    {
      id: `atlas-${kind}-outline`,
      type: "line",
      source: "atlas-countries",
      paint: {
        "line-color": MAP_COLORS.cityLabel,
        "line-width": 1.25,
        "line-opacity": onlyHovered(0.85),
        "line-translate": [0, 0],
        "line-translate-anchor": "viewport",
        "line-translate-transition": transition,
        "line-opacity-transition": transition,
      },
    },
    beforeId,
  );

  // Animate uniform translation only. Changing feature-state opacity expressions
  // here rebuilds worker tiles and delays border rendering.
  function paint() {
    if (disposed || !map.getLayer(`atlas-${kind}-land`)) return;
    const offset: [number, number] = [0, duration(160) ? -2 * progress : 0];
    for (const id of fillIds)
      map.setPaintProperty(id, "fill-translate", offset, uniformPaintOptions);
    map.setPaintProperty(
      `atlas-${kind}-outline`,
      "line-translate",
      offset,
      uniformPaintOptions,
    );
  }
  function state(code: string, value: boolean) {
    if (map.getSource("atlas-countries"))
      map.setFeatureState(
        { source: "atlas-countries", id: code },
        { [flag]: value },
      );
  }
  function updateCountries(next: CountryVisit[]) {
    if (disposed || !map.getLayer(`atlas-${kind}-land`)) return;
    map.setPaintProperty("atlas-land", "fill-color", fillColors(next));
    map.setPaintProperty("atlas-land", "fill-opacity", [
      "case",
      hovered,
      0,
      countryFillOpacity(next),
    ]);
    map.setPaintProperty("atlas-borders", "line-opacity", [
      "case",
      hovered,
      0,
      0.9,
    ]);
    map.setPaintProperty(`atlas-${kind}-land`, "fill-color", fillColors(next));
    map.setPaintProperty(
      `atlas-${kind}-land`,
      "fill-opacity",
      onlyHovered(countryFillOpacity(next)),
    );
    for (const layer of countryStripeLayers(next)) {
      map.setFilter(layer.id, layer.filter ?? null);
      map.setPaintProperty(layer.id, "fill-opacity", ["case", hovered, 0, 1]);
      map.setFilter(`atlas-${kind}-${layer.id}`, layer.filter ?? null);
    }
  }
  function setCountry(code: string | null, immediate = false) {
    if (disposed || (code === target && !immediate)) return;
    cancelAnimationFrame(frame);
    target = code;
    if (code && code !== active) {
      if (active) state(active, false);
      active = code;
      progress = 0;
      state(code, true);
    }
    const from = progress,
      to = code ? 1 : 0;
    const start = performance.now(),
      milliseconds = immediate ? 0 : duration(code ? 160 : 120);
    const tick = (now: number) => {
      if (disposed) return;
      const fraction = milliseconds
        ? Math.min(1, (now - start) / milliseconds)
        : 1;
      progress = from + (to - from) * (1 - (1 - fraction) ** 3);
      paint();
      if (fraction < 1) frame = requestAnimationFrame(tick);
      else if (!target && active) {
        state(active, false);
        active = null;
      }
    };
    tick(start);
  }
  updateCountries(countries);
  return {
    setCountry,
    getCountry: () => active,
    updateCountries,
    destroy() {
      cancelAnimationFrame(frame);
      if (active) state(active, false);
      active = target = null;
      disposed = true;
      for (const id of [
        ...fillIds,
        `atlas-${kind}-shadow`,
        `atlas-${kind}-shadow-edge`,
        `atlas-${kind}-outline`,
      ])
        if (map.getLayer(id)) map.removeLayer(id);
    },
  };
}

export function createCountryHover(
  map: MapInstance,
  countries: CountryVisit[],
  beforeId: string | undefined,
  duration: (milliseconds: number) => number,
) {
  const selection = createHighlight(
    map,
    countries,
    beforeId,
    duration,
    "selected",
  );
  const hover = createHighlight(map, countries, beforeId, duration, "hover");
  let selected: string | null = null;
  return {
    setCountry(code: string | null) {
      hover.setCountry(code === selected ? null : code);
    },
    setSelectedCountry(code: string | null) {
      if (code === selected) return;
      selected = code;
      if (code && hover.getCountry() === code) hover.setCountry(null, true);
      selection.setCountry(code, true);
    },
    updateCountries(next: CountryVisit[]) {
      selection.updateCountries(next);
      hover.updateCountries(next);
    },
    destroy() {
      hover.destroy();
      selection.destroy();
    },
  };
}
