import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Pbf from "pbf";
import {
  createExpression,
  validateStyleMin,
} from "@maplibre/maplibre-gl-style-spec";
import type {
  ExpressionSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import {
  bilingualPlaceName,
  LABEL_FONTS,
  providerTypography,
} from "../src/lib/map-typography.js";

const layer: SymbolLayerSpecification = {
  id: "place_label",
  type: "symbol",
  source: "places",
  layout: { "text-field": ["get", "name"] },
};
function evaluate(value: unknown, properties: Record<string, string>) {
  const expression = createExpression(value as ExpressionSpecification);
  assert.equal(expression.result, "success", JSON.stringify(expression.value));
  if (expression.result !== "success")
    throw new Error("Invalid label expression");
  return expression.value.evaluate(
    { zoom: 6 },
    { type: 1, geometry: [], properties },
  );
}
test("generic geographic layers distinguish city and subdivision features by class, not names", () => {
  const font = providerTypography(layer).layout["text-font"];
  assert.deepEqual(evaluate(font, { class: "city", name: "Region City" }), [
    LABEL_FONTS.city,
  ]);
  assert.deepEqual(evaluate(font, { class: "province", name: "Kyzylorda" }), [
    LABEL_FONTS.subdivision,
  ]);
  assert.deepEqual(evaluate(font, { place: "district", name: "Central" }), [
    LABEL_FONTS.subdivision,
  ]);
});
test("label layouts validate against MapLibre, including mixed-class layers", () => {
  const layers = ["place_state", "place_city", "place_label"].map((id) => {
    const original = { ...layer, id };
    return {
      ...original,
      layout: { ...original.layout, ...providerTypography(original).layout },
    };
  });
  const style = {
    version: 8,
    glyphs: "https://example.test/fonts/{fontstack}/{range}.pbf",
    sources: {
      places: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers,
  } as StyleSpecification;
  const errors = validateStyleMin(style);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
test("bilingual names preserve Cyrillic and avoid duplicate second lines", () => {
  const expression = bilingualPlaceName();
  assert.equal(
    String(
      evaluate(expression, {
        "name:latin": "Kyzylorda",
        "name:nonlatin": "Қызылорда",
      }),
    ),
    "Kyzylorda\nҚызылорда",
  );
  assert.equal(
    String(
      evaluate(expression, { "name:latin": "Kyiv", "name:nonlatin": "Kyiv" }),
    ),
    "Kyiv",
  );
  assert.equal(
    String(evaluate(expression, { name: "Қызылорда" })),
    "Қызылорда",
  );
});
interface Glyph {
  id: number;
  bitmap: Uint8Array;
  width: number;
  height: number;
}
function readGlyph(tag: number, g: Glyph, p: Pbf) {
  if (tag === 1) g.id = p.readVarint();
  else if (tag === 2) g.bitmap = p.readBytes();
  else if (tag === 3) g.width = p.readVarint();
  else if (tag === 4) g.height = p.readVarint();
}
function readStack(tag: number, g: Glyph[], p: Pbf) {
  if (tag === 3)
    g.push(
      p.readMessage(readGlyph, {
        id: 0,
        bitmap: new Uint8Array(),
        width: 0,
        height: 0,
      }),
    );
}
function readStacks(tag: number, g: Glyph[], p: Pbf) {
  if (tag === 1) p.readMessage(readStack, g);
}
test("bundled serif, city and italic glyphs contain usable Latin and Kazakh Cyrillic bitmaps", () => {
  for (const font of Object.values(LABEL_FONTS)) {
    const glyphs = [
      ...new Pbf(readFileSync(`public/fonts/${font}/0-255.pbf`)).readFields(
        readStacks,
        [] as Glyph[],
      ),
      ...new Pbf(readFileSync(`public/fonts/${font}/1024-1279.pbf`)).readFields(
        readStacks,
        [] as Glyph[],
      ),
    ];
    for (const character of ["K", "v", "Ә", "Қ", "Ұ"]) {
      const glyph = glyphs.find((g) => g.id === character.codePointAt(0));
      assert.ok(glyph, `${font} is missing ${character}`);
      assert.equal(
        glyph.bitmap.length,
        (glyph.width + 6) * (glyph.height + 6),
        `${font}: invalid SDF dimensions`,
      );
      assert.ok(
        glyph.bitmap.some((alpha) => alpha > 128),
        `${font}: empty glyph ${character}`,
      );
    }
  }
});
