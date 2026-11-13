import test from "node:test";
import assert from "node:assert/strict";
import {
  featureFilter,
  validateStyleMin,
  type ICanonicalTileID,
} from "@maplibre/maplibre-gl-style-spec";
import type { SymbolLayerSpecification } from "maplibre-gl";
import type { City } from "../src/lib/types";
import { providerLabelFilters } from "../src/lib/map-labels";

const city = (name: string, coordinates: [number, number] | null): City =>
  ({ name, coordinates }) as City;
const layer: SymbolLayerSpecification = {
  id: "place-city",
  type: "symbol",
  source: "places",
  filter: ["in", "class", "city", "town", "state"],
  layout: { "text-field": ["get", "name"] },
};
function visible(
  filtered: SymbolLayerSpecification,
  properties: Record<string, string>,
  [lng, lat]: [number, number],
) {
  const sin = Math.sin((lat * Math.PI) / 180);
  return featureFilter(filtered.filter).filter(
    { zoom: 8 },
    {
      type: 1,
      properties,
      geometry: [
        [
          {
            x: ((lng + 180) / 360) * 8192,
            y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 8192,
          },
        ],
      ],
    },
    { z: 0, x: 0, y: 0 } as ICanonicalTileID,
  );
}
test("duplicate basemap names are hidden locally while unrelated places and regions remain", () => {
  const [filtered] = providerLabelFilters(
    [layer],
    [city("Abu Dhabi", [54.39696, 24.45118])],
  );
  assert.equal(
    visible(
      filtered,
      { class: "city", "name:latin": "Abu Dhabi" },
      [54.38, 24.45],
    ),
    false,
  );
  assert.equal(
    visible(filtered, { class: "town", "name:en": "ABU DHABI" }, [54.4, 24.46]),
    false,
  );
  assert.equal(
    visible(filtered, { class: "city", name: "Dubai" }, [55.31, 25.08]),
    true,
  );
  assert.equal(
    visible(filtered, { class: "city", name: "Abu Dhabi" }, [2, 49]),
    true,
  );
  assert.equal(
    visible(filtered, { class: "state", name: "Abu Dhabi" }, [54.4, 24.45]),
    true,
  );
  assert.equal(
    visible(filtered, { class: "village", name: "Other place" }, [54.4, 24.45]),
    false,
  );
});
test("common city-name variants match and empty filters restore basemap labels", () => {
  const [filtered] = providerLabelFilters(
    [layer],
    [city("Krong Siem Reap", [103.86056, 13.36179])],
  );
  assert.equal(
    visible(
      filtered,
      { class: "city", "name:latin": "Siem Reap" },
      [103.86, 13.36],
    ),
    false,
  );
  assert.equal(
    visible(filtered, { class: "town", name: "Nearby town" }, [103.9, 13.4]),
    true,
  );
  assert.deepEqual(providerLabelFilters([layer], []), [layer]);
  assert.deepEqual(providerLabelFilters([layer], [city("Missing", null)]), [
    layer,
  ]);
});
test("duplicate filters validate with MapLibre and preserve known subdivision layers", () => {
  const layers = providerLabelFilters(
    [layer, { ...layer, id: "place-state" }],
    [city("Abu Dhabi", [54.39696, 24.45118])],
  );
  assert.equal(
    visible(layers[1], { class: "state", name: "Abu Dhabi" }, [54.4, 24.45]),
    true,
  );
  const errors = validateStyleMin({
    version: 8,
    sources: {
      places: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    glyphs: "https://example.test/fonts/{fontstack}/{range}.pbf",
    layers,
  });
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
