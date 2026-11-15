import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const metadata = JSON.parse(
  readFileSync(
    process.argv[2] ?? "data/sources/patagonia-outline.json",
    "utf8",
  ),
);
mkdirSync(".cache/places", { recursive: true });
const cache = `.cache/places/${metadata.sha256}.geojson`;
if (!existsSync(cache)) {
  const response = await fetch(metadata.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(`Outline source download failed (${response.status}).`);
  writeFileSync(cache, await response.text());
}
const input = readFileSync(cache);
if (createHash("sha256").update(input).digest("hex") !== metadata.sha256)
  throw new Error("Outline source checksum mismatch.");
const source = JSON.parse(input.toString());
const selected = source.features.filter(
  (feature: { properties: { iso_3166_2: string } }) =>
    metadata.codes.includes(feature.properties.iso_3166_2),
);
if (selected.length !== metadata.codes.length)
  throw new Error("The approved outline province inventory does not match.");
const selectedFile = `.cache/places/${metadata.placeId}-admin1.geojson`,
  output = `.cache/places/${metadata.placeId}-outline.geojson`;
writeFileSync(
  selectedFile,
  JSON.stringify({ type: "FeatureCollection", features: selected }),
);
execFileSync(
  "node_modules/.bin/mapshaper",
  [
    selectedFile,
    "-clip",
    `bbox=${metadata.clipBounds.join(",")}`,
    "-dissolve",
    "-simplify",
    "2%",
    "keep-shapes",
    "-o",
    output,
    "format=geojson",
    "precision=0.0001",
    "force",
  ],
  { stdio: "inherit" },
);
const result = JSON.parse(readFileSync(output, "utf8"));
const geometry =
  result.type === "GeometryCollection" && result.geometries.length === 1
    ? result.geometries[0]
    : result.type === "FeatureCollection" && result.features.length === 1
      ? result.features[0].geometry
      : result;
if (
  !["Polygon", "MultiPolygon"].includes(geometry.type) ||
  createHash("sha256").update(JSON.stringify(geometry)).digest("hex") !==
    metadata.geometrySha256
)
  throw new Error(
    "Outline geometry differs from its approved provenance record.",
  );
mkdirSync(dirname(metadata.outline), { recursive: true });
writeFileSync(
  metadata.outline,
  JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: metadata.placeId,
        properties: { id: metadata.placeId, name: metadata.name },
        geometry,
      },
    ],
  }) + "\n",
);
console.log(
  `Prepared ${metadata.name}: one outline across ${selected.length} provinces.`,
);
