import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { outlineContains } from "../src/lib/places";

interface Selector {
  property?: string;
  value?: string;
  values?: string[];
  featureContaining?: number[];
  componentsWithin?: number[];
  componentContaining?: number[];
}
interface Input {
  url: string;
  sha256: string;
  selector?: Selector;
  format?: "topojson";
  fromProjection?: string;
  dissolveBeforeSelect?: boolean;
  ringsAsParts?: boolean;
}
interface Source {
  placeId: string;
  name: string;
  url?: string;
  sha256?: string;
  selector?: Selector;
  inputs?: Input[];
  dissolve?: boolean;
  dissolveOverlaps?: boolean;
  simplifyInterval?: number;
  minIslandArea?: string;
  fillHoles?: boolean;
  outline: string;
  geometrySha256: string;
}
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const sources = JSON.parse(
  readFileSync(
    process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
      "data/sources/city-place-outlines-2026-11-16.json",
    "utf8",
  ),
) as Source[];
mkdirSync(".cache/places", { recursive: true });
function transform(
  features: Feature<Polygon | MultiPolygon>[],
  scope: string,
  args: string[],
) {
  const input = `.cache/places/${scope}-selected.geojson`;
  const output = `.cache/places/${scope}-transformed.geojson`;
  writeFileSync(input, JSON.stringify({ type: "FeatureCollection", features }));
  execFileSync(
    "node_modules/.bin/mapshaper",
    [input, ...args, "-o", output, "format=geojson", "force"],
    { stdio: "pipe" },
  );
  return asFeatures(JSON.parse(readFileSync(output, "utf8")));
}
function asFeatures(value: any): FeatureCollection<Polygon | MultiPolygon> {
  if (value.type === "FeatureCollection") return value;
  const geometries =
    value.type === "GeometryCollection"
      ? value.geometries
      : [value.type === "Feature" ? value.geometry : value];
  return {
    type: "FeatureCollection",
    features: geometries.map((geometry: Polygon | MultiPolygon) => ({
      type: "Feature",
      properties: {},
      geometry,
    })),
  };
}
async function readInput(input: Input, scope: string) {
  const cache = `.cache/places/${input.sha256}.${input.format === "topojson" ? "topojson" : "geojson"}`;
  if (!existsSync(cache)) {
    const response = await fetch(input.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Outline download failed (${response.status}).`);
    writeFileSync(cache, await response.text());
  }
  const bytes = readFileSync(cache);
  if (hash(bytes) !== input.sha256)
    throw new Error(`Outline source changed: ${scope}.`);
  let collection: FeatureCollection<Polygon | MultiPolygon>;
  if (input.format === "topojson") {
    const output = `.cache/places/${scope}-imported.geojson`;
    execFileSync(
      "node_modules/.bin/mapshaper",
      [cache, "-o", output, "format=geojson", "force"],
      { stdio: "pipe" },
    );
    collection = asFeatures(JSON.parse(readFileSync(output, "utf8")));
  } else collection = asFeatures(JSON.parse(bytes.toString()));
  // The MLIT municipal mirror flattened detached coastal parts into one
  // polygon's ring list. Restore those parts before unioning the peninsula.
  if (input.ringsAsParts)
    collection.features = collection.features.map((feature) => {
      const polygons =
        feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      return {
        ...feature,
        geometry: {
          type: "MultiPolygon",
          coordinates: polygons.flatMap((polygon) =>
            polygon.map((ring) => [ring]),
          ),
        },
      };
    });
  if (input.fromProjection)
    collection = transform(collection.features, scope + "-projected", [
      "-proj",
      `from=${input.fromProjection}`,
      "wgs84",
    ]);
  if (input.dissolveBeforeSelect)
    collection = transform(collection.features, scope + "-dissolved", [
      "-dissolve2",
    ]);
  let matches = collection.features.filter((f) =>
    ["Polygon", "MultiPolygon"].includes(f.geometry?.type),
  );
  const selector = input.selector;
  if (selector?.property) {
    const values = selector.values ?? [selector.value!];
    matches = matches.filter((f) =>
      values.includes(f.properties?.[selector.property!]),
    );
    if (matches.length !== values.length)
      throw new Error(`Source feature inventory differs: ${scope}.`);
  }
  if (selector?.featureContaining) {
    matches = matches.filter((f) =>
      outlineContains(f.geometry, selector.featureContaining!),
    );
    if (matches.length !== 1)
      throw new Error(`Expected one containing source feature: ${scope}.`);
  }
  if (!matches.length) throw new Error(`No polygon geometry: ${scope}.`);
  return { matches, selector };
}
for (const source of sources) {
  const inputs = source.inputs ?? [
    { url: source.url!, sha256: source.sha256!, selector: source.selector },
  ];
  const features: Feature<Polygon | MultiPolygon>[] = [];
  for (const [i, input] of inputs.entries()) {
    const { matches, selector } = await readInput(
      input,
      source.placeId + "-" + i,
    );
    for (const feature of matches) {
      let geometry = feature.geometry;
      const bounds = selector?.componentsWithin;
      if (bounds) {
        const polygons =
          geometry.type === "Polygon"
            ? [geometry.coordinates]
            : geometry.coordinates;
        const components = polygons.filter((polygon) =>
          polygon.every((ring) =>
            ring.every(
              ([x, y]) =>
                x >= bounds[0] &&
                y >= bounds[1] &&
                x <= bounds[2] &&
                y <= bounds[3],
            ),
          ),
        );
        if (!components.length)
          throw new Error(`No whole coastline components: ${source.placeId}.`);
        geometry = { type: "MultiPolygon", coordinates: components };
      }
      if (selector?.componentContaining) {
        const polygons =
          geometry.type === "Polygon"
            ? [geometry.coordinates]
            : geometry.coordinates;
        const components = polygons.filter((coordinates) =>
          outlineContains(
            { type: "Polygon", coordinates },
            selector.componentContaining!,
          ),
        );
        if (components.length !== 1)
          throw new Error(
            `Expected one containing coastline component: ${source.placeId}.`,
          );
        geometry = { type: "MultiPolygon", coordinates: components };
      }
      features.push({ ...feature, geometry });
    }
  }
  const operations: string[] = [];
  if (source.dissolveOverlaps) operations.push("-dissolve2");
  else if (source.dissolve) operations.push("-dissolve");
  if (source.minIslandArea)
    operations.push(
      "-filter-islands",
      `min-area=${source.minIslandArea}`,
      "remove-empty",
    );
  if (source.simplifyInterval)
    operations.push(
      "-simplify",
      "dp",
      `interval=${source.simplifyInterval}`,
      "keep-shapes",
    );
  let geometry: Polygon | MultiPolygon;
  if (operations.length) {
    const transformed = transform(features, source.placeId, operations);
    if (transformed.features.length !== 1)
      throw new Error("A place outline must dissolve to one feature.");
    geometry = transformed.features[0].geometry;
  } else {
    if (features.length !== 1)
      throw new Error("Multiple source features require a dissolved outline.");
    geometry = features[0].geometry;
  }
  if (source.fillHoles)
    geometry =
      geometry.type === "Polygon"
        ? { type: "Polygon", coordinates: [geometry.coordinates[0]] }
        : {
            type: "MultiPolygon",
            coordinates: geometry.coordinates.map((polygon) => [polygon[0]]),
          };
  if (process.argv.includes("--review"))
    console.log(
      JSON.stringify({
        place: source.placeId,
        geometrySha256: hash(JSON.stringify(geometry)),
      }),
    );
  else if (hash(JSON.stringify(geometry)) !== source.geometrySha256)
    throw new Error(`Approved geometry changed: ${source.placeId}.`);
  const feature: Feature<Polygon | MultiPolygon> = {
    type: "Feature",
    id: source.placeId,
    properties: { id: source.placeId, name: source.name },
    geometry,
  };
  const output =
    JSON.stringify({ type: "FeatureCollection", features: [feature] }) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(source.outline, "utf8") !== output)
      throw new Error(`Bundled outline changed: ${source.placeId}.`);
  } else writeFileSync(source.outline, output);
}
console.log(
  `${sources.length} sourced outlines ${process.argv.includes("--check") ? "verified" : "prepared"}.`,
);
