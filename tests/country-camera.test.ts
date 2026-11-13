import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FeatureCollection } from "geojson";
import { countryBounds, positionBounds } from "../src/lib/country-camera";

const geometry = JSON.parse(
  readFileSync("public/atlas/countries.geojson", "utf8"),
) as FeatureCollection;

test("country framing uses the full boundary rather than its city locations", () => {
  const albania = countryBounds(geometry, "AL")!;
  assert.ok(albania[0][0] < 19.5 && albania[1][0] > 20.5);
  assert.ok(albania[0][1] < 40 && albania[1][1] > 42);
  assert.equal(countryBounds(geometry, "missing"), null);
});

test("date-line countries have a narrow frame instead of spanning the world", () => {
  const fiji = countryBounds(geometry, "FJ")!;
  assert.ok(fiji[1][0] - fiji[0][0] < 10);
  assert.deepEqual(
    positionBounds([
      [179, -18],
      [-179, -16],
    ]),
    [
      [179, -18],
      [181, -16],
    ],
  );
  const russia = countryBounds(geometry, "RU")!;
  assert.ok(russia[1][0] - russia[0][0] < 190);
});

test("camera fallbacks handle a single known location and missing positions", () => {
  assert.deepEqual(positionBounds([[20, 41]]), [
    [20, 41],
    [20, 41],
  ]);
  assert.equal(positionBounds([]), null);
});

test("remote overseas territories do not force a global view while archipelagos stay together", () => {
  const france = countryBounds(geometry, "FR")!;
  assert.ok(france[0][0] > -10 && france[1][0] < 15);
  assert.ok(france[0][1] > 40 && france[1][1] > 50);
  const indonesia = countryBounds(geometry, "ID")!;
  assert.ok(indonesia[0][0] < 100 && indonesia[1][0] > 140);
});
