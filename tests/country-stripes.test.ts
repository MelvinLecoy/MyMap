import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createExpression,
  validateStyleMin,
} from "@maplibre/maplibre-gl-style-spec";
import type {
  ExpressionSpecification,
  Map as MapInstance,
  StyleSpecification,
} from "maplibre-gl";
import {
  buildCountryRecords,
  latestCountryVisit,
  mergeCountryVisits,
  type CountrySeed,
} from "../src/lib/countries";
import {
  countryStripeImage,
  countryStripeLayers,
  countryStripeYear,
} from "../src/lib/country-stripes";
import {
  COUNTRY_STRIPE_COLORS,
  MAP_COLORS,
  VISIT_YEAR_COLORS,
} from "../src/lib/palette";
import { countryFillOpacity, fillColors } from "../src/lib/map-style";
import {
  createCountrySelection,
  restoreCountryPaint,
} from "../src/lib/country-selection";
import type { CountryVisit } from "../src/lib/types";

test("country stripes use the latest actual stay and preserve existing country fills", () => {
  const seeds = JSON.parse(readFileSync("src/generated/countries.json", "utf8"))
    .countries as CountrySeed[];
  const records = buildCountryRecords(seeds, []);
  const initial: CountryVisit[] = [
    { code: "NL", visited: true, color: "#123456" },
  ];
  const before = structuredClone(seeds);
  const countries = mergeCountryVisits(initial, records);
  assert.deepEqual(seeds, before);
  assert.equal(
    countries.find((country) => country.code === "NL")?.color,
    "#123456",
  );
  assert.equal(countries.filter((country) => country.visited).length, 98);
  const layers = countryStripeLayers(countries);
  const assigned = (code: string) =>
    layers
      .filter((layer) => {
        const expression = createExpression(layer.filter!);
        assert.equal(expression.result, "success");
        if (expression.result !== "success")
          throw new Error("Invalid stripe filter");
        return expression.value.evaluate(
          { zoom: 2 },
          { type: 3, geometry: [], properties: { code } },
        );
      })
      .map((layer) => layer.id);
  for (const [code, year] of [
    ["NL", "2023"],
    ["PL", "2024"],
    ["IE", "2025"],
  ]) {
    assert.deepEqual(assigned(code), ["atlas-visit-stripes-" + year]);
  }
  for (const code of ["CA", "HN", "US", "AF", "FI", "AU", "GB"])
    assert.deepEqual(assigned(code), []);
  assert.equal(layers.length, 3);
  assert.equal(
    layers.some((layer) => layer.id.endsWith("2026")),
    false,
  );
  assert.equal(
    latestCountryVisit({
      visits: [
        {
          number: 1,
          arrival: "2025-12-01",
          departure: "2026-01-10",
          daysSpent: null,
          periods: [
            { number: 1, arrival: "2025-12-01", departure: "2025-12-05" },
          ],
        },
        { number: 2, arrival: "2024-05", departure: null, daysSpent: null },
      ],
    }),
    "2025-12-05",
  );
  assert.equal(latestCountryVisit({ visits: [] }), null);
});

test("brown stripes include 2023 and every earlier known year, without assigning undated visits", () => {
  for (const date of [
    "0001",
    "1901-01-01",
    "1999-12-31",
    "2022-08",
    "2023-12-31",
  ])
    assert.equal(countryStripeYear(date), "2023");
  assert.equal(countryStripeYear("2024-01-01"), "2024");
  assert.equal(countryStripeYear("2025-12-31"), "2025");
  for (const date of [
    null,
    undefined,
    "",
    "unknown",
    "0000",
    "2023wrong",
    "2026",
    "2027-01-01",
  ])
    assert.equal(countryStripeYear(date), null);
  const [brown] = countryStripeLayers([
    { code: "FR", color: null, visited: true, lastVisited: "2022-03-04" },
    { code: "DE", color: null, visited: false, lastVisited: "2021-03-04" },
  ]);
  const expression = createExpression(brown.filter!);
  assert.equal(expression.result, "success");
  if (expression.result !== "success") throw new Error("Invalid stripe filter");
  assert.equal(
    expression.value.evaluate(
      { zoom: 2 },
      { type: 3, geometry: [], properties: { code: "FR" } },
    ),
    true,
  );
  assert.equal(
    expression.value.evaluate(
      { zoom: 2 },
      { type: 3, geometry: [], properties: { code: "DE" } },
    ),
    false,
  );
});

test("every visited year has the same solid green base while unvisited land keeps its existing opacity", () => {
  const countries: CountryVisit[] = [
    ...["2026", "2025", "2024", "2023", null].map((lastVisited, index) => ({
      code: String(index),
      visited: true,
      color: null,
      lastVisited,
    })),
    { code: "AF", visited: false, color: null },
  ];
  const fill = createExpression(
    fillColors(countries) as ExpressionSpecification,
  );
  const opacity = createExpression(countryFillOpacity(countries));
  assert.equal(fill.result, "success");
  assert.equal(opacity.result, "success");
  if (fill.result !== "success" || opacity.result !== "success")
    throw new Error("Invalid country fill");
  for (const country of countries) {
    const feature = {
      type: 3 as const,
      geometry: [],
      properties: { code: country.code },
    };
    assert.equal(
      fill.value.evaluate({ zoom: 2 }, feature),
      country.visited ? MAP_COLORS.visitedCountry : MAP_COLORS.land,
    );
    assert.equal(
      opacity.value.evaluate({ zoom: 2 }, feature),
      country.visited ? 1 : 0.95,
    );
  }
});

test("history layer uses solid panel year colours and greys unvisited and uncatalogued countries", () => {
  const countries: CountryVisit[] = [
    { code: "CA", visited: true, color: "#123456", lastVisited: "2026" },
    { code: "FR", visited: true, color: null, lastVisited: "2024" },
    { code: "GB", visited: true, color: null, lastVisited: null },
    { code: "US", visited: true, color: null },
    { code: "IE", visited: true, color: null, lastVisited: "2025-09-01" },
    { code: "NL", visited: true, color: null, lastVisited: "2023" },
    { code: "IT", visited: true, color: null, lastVisited: "2021-03" },
    { code: "AF", visited: false, color: "#abcdef", lastVisited: "2025" },
  ];
  const before = structuredClone(countries);
  const evaluate = (layer: "standard" | "last-visit", code: string) => {
    const expression = createExpression(
      fillColors(countries, layer) as ExpressionSpecification,
    );
    assert.equal(expression.result, "success");
    if (expression.result !== "success") throw new Error("Invalid fill");
    return expression.value.evaluate(
      { zoom: 2 },
      { type: 3, geometry: [], properties: { code } },
    );
  };
  for (const [code, color] of Object.entries({
    CA: MAP_COLORS.visitedCountry,
    FR: VISIT_YEAR_COLORS[2024],
    GB: MAP_COLORS.visitedCountry,
    US: MAP_COLORS.visitedCountry,
    IE: "#dfbf00",
    NL: VISIT_YEAR_COLORS[2023],
    IT: VISIT_YEAR_COLORS[2023],
  }))
    assert.equal(evaluate("last-visit", code), color);
  for (const code of ["AF", "ZZ"])
    assert.equal(evaluate("last-visit", code), MAP_COLORS.unvisitedCountry);
  assert.equal(evaluate("standard", "AF"), "#abcdef");
  assert.equal(evaluate("standard", "CA"), "#123456");
  assert.equal(evaluate("standard", "IE"), MAP_COLORS.visitedCountry);
  assert.equal(evaluate("standard", "ZZ"), MAP_COLORS.land);
  assert.equal(fillColors([], "last-visit"), MAP_COLORS.unvisitedCountry);
  assert.equal(fillColors([]), MAP_COLORS.land);
  assert.deepEqual(countries, before);
  assert.deepEqual(countryStripeLayers(countries), countryStripeLayers(before));
  assert.ok(
    countryStripeLayers(countries).every(
      (stripe) => stripe.layout?.visibility === "visible",
    ),
  );
  assert.ok(
    countryStripeLayers(countries, false).every(
      (stripe) => stripe.layout?.visibility === "none",
    ),
  );
});

test("selected country and responsive paint restoration retain the chosen layer through data changes", () => {
  const countries: CountryVisit[] = [
    { code: "AF", visited: false, color: null },
  ];
  const layers = new Map<string, any>([
    ["atlas-land", { paint: {} }],
    ["atlas-borders", { paint: {} }],
    ...countryStripeLayers(countries).map(
      (layer) => [layer.id, structuredClone(layer)] as [string, any],
    ),
  ]);
  const map = {
    getLayer: (id: string) => layers.get(id),
    getSource: () => ({}),
    addLayer: (layer: any) => layers.set(layer.id, layer),
    removeLayer: (id: string) => layers.delete(id),
    setPaintProperty: (id: string, key: string, value: unknown) => {
      layers.get(id).paint[key] = value;
    },
    setFilter: (id: string, value: unknown) => {
      layers.get(id).filter = value;
    },
    setLayoutProperty: (id: string, key: string, value: unknown) => {
      (layers.get(id).layout ??= {})[key] = value;
    },
    setFeatureState: () => {},
  } as unknown as MapInstance;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const selection = createCountrySelection(
      map,
      countries,
      undefined,
      () => 0,
      "last-visit",
    );
    selection.setSelectedCountry("AF");
    assert.equal(
      layers.get("atlas-selected-outline").paint["line-color"],
      "#000000",
    );
    for (const stripe of countryStripeLayers(countries)) {
      assert.equal(layers.get(stripe.id).layout.visibility, "none");
      assert.equal(
        layers.get(`atlas-selected-${stripe.id}`).layout.visibility,
        "none",
      );
    }
    for (const id of ["atlas-land", "atlas-selected-land"])
      assert.deepEqual(
        layers.get(id).paint["fill-color"],
        fillColors(countries, "last-visit"),
      );
    const visited = [{ ...countries[0], visited: true, lastVisited: "2025" }];
    selection.updateCountries(visited);
    for (const id of ["atlas-land", "atlas-selected-land"])
      assert.deepEqual(
        layers.get(id).paint["fill-color"],
        fillColors(visited, "last-visit"),
      );
    selection.updateCountries(countries, "standard");
    for (const stripe of countryStripeLayers(countries)) {
      assert.equal(layers.get(stripe.id).layout.visibility, "visible");
      assert.equal(
        layers.get(`atlas-selected-${stripe.id}`).layout.visibility,
        "visible",
      );
    }
    for (const id of ["atlas-land", "atlas-selected-land"])
      assert.deepEqual(
        layers.get(id).paint["fill-color"],
        fillColors(countries),
      );
    selection.destroy();
    restoreCountryPaint(map, countries, "last-visit");
    for (const stripe of countryStripeLayers(countries))
      assert.equal(layers.get(stripe.id).layout.visibility, "none");
    assert.deepEqual(
      layers.get("atlas-land").paint["fill-color"],
      fillColors(countries, "last-visit"),
    );
  } finally {
    if (previousCancel) globalThis.cancelAnimationFrame = previousCancel;
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  }
});

test("stripe layers validate with dated, undated and empty country data", () => {
  for (const countries of [
    [],
    [{ code: "CA", visited: true, color: null, lastVisited: null }],
  ]) {
    const style: StyleSpecification = {
      version: 8,
      sources: {
        "atlas-countries": {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        },
      },
      layers: [
        {
          id: "atlas-land",
          type: "fill",
          source: "atlas-countries",
          paint: {
            "fill-color": fillColors(countries) as ExpressionSpecification,
            "fill-opacity": countryFillOpacity(countries),
          },
        },
        ...countryStripeLayers(countries),
      ],
    };
    assert.deepEqual(
      validateStyleMin(style).map((error) => error.message),
      [],
    );
  }
});

test("dense stripe images leave most of the existing green visible through transparent gaps", () => {
  for (const color of Object.values(COUNTRY_STRIPE_COLORS)) {
    const image = countryStripeImage(color);
    const rgb = color
      .match(/[a-f0-9]{2}/gi)!
      .map((value) => parseInt(value, 16));
    let coverage = 0,
      transparent = 0,
      opaque = 0;
    assert.equal(image.width & (image.width - 1), 0);
    assert.equal(image.height & (image.height - 1), 0);
    for (let index = 0; index < image.data.length; index += 4) {
      assert.deepEqual([...image.data.slice(index, index + 3)], rgb);
      const alpha = image.data[index + 3];
      coverage += alpha / 255;
      if (alpha === 0) transparent++;
      if (alpha === 255) opaque++;
    }
    const pixels = image.width * image.height;
    assert.ok(transparent >= pixels / 2);
    assert.ok(opaque > 0);
    assert.ok(coverage / pixels > 0.3 && coverage / pixels < 0.45);
  }
});
