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

interface Source {
  placeId: string;
  name: string;
  url: string;
  sha256: string;
  selector: {
    property: string;
    value?: string;
    values?: string[];
    componentsWithin?: number[];
    componentContaining?: number[];
  };
  dissolve?: boolean;
  outline: string;
  geometrySha256: string;
}
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const sources = JSON.parse(
  readFileSync("data/sources/city-place-outlines-2026-11-16.json", "utf8"),
) as Source[];
mkdirSync(".cache/places", { recursive: true });
for (const source of sources) {
  const cache = `.cache/places/${source.sha256}.geojson`;
  if (!existsSync(cache)) {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Outline download failed (${response.status}).`);
    writeFileSync(cache, await response.text());
  }
  const bytes = readFileSync(cache);
  if (hash(bytes) !== source.sha256)
    throw new Error(`Outline source changed: ${source.placeId}.`);
  const collection = JSON.parse(bytes.toString()) as FeatureCollection<
    Polygon | MultiPolygon
  >;
  const values = source.selector.values ?? [source.selector.value!];
  const matches = collection.features.filter((f) =>
    values.includes(f.properties?.[source.selector.property]),
  );
  if (matches.length !== values.length)
    throw new Error(`Source feature inventory differs: ${source.placeId}.`);
  let geometry = matches[0].geometry;
  if (source.dissolve) {
    const input = `.cache/places/${source.placeId}-selected.geojson`;
    const output = `.cache/places/${source.placeId}-union.geojson`;
    writeFileSync(
      input,
      JSON.stringify({ type: "FeatureCollection", features: matches }),
    );
    execFileSync(
      "node_modules/.bin/mapshaper",
      [input, "-dissolve", "-o", output, "format=geojson", "force"],
      { stdio: "pipe" },
    );
    const dissolved = JSON.parse(readFileSync(output, "utf8"));
    geometry =
      dissolved.type === "FeatureCollection"
        ? dissolved.features[0].geometry
        : dissolved.type === "GeometryCollection"
          ? dissolved.geometries[0]
          : dissolved;
  } else if (matches.length !== 1)
    throw new Error("Multiple source features require a dissolved outline.");
  const bounds = source.selector.componentsWithin;
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
  if (source.selector.componentContaining) {
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    const components = polygons.filter((coordinates) =>
      outlineContains(
        { type: "Polygon", coordinates },
        source.selector.componentContaining!,
      ),
    );
    if (components.length !== 1)
      throw new Error(
        `Expected one containing coastline component: ${source.placeId}.`,
      );
    geometry = { type: "MultiPolygon", coordinates: components };
  }
  if (hash(JSON.stringify(geometry)) !== source.geometrySha256)
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
  `${sources.length} sourced outlines ${process.argv.includes("--check") ? "verified" : "prepared"}; pending boundaries remain unset.`,
);
