import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { FeatureCollection, Feature, Geometry, Point } from "geojson";
import { countryCode } from "./importer.js";
// Fixed Natural Earth 5.1.2 inputs; checksums also make refreshes reproducible.
const inputs = [
  [
    "countries",
    "ne_50m_admin_0_countries",
    "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb",
  ],
  [
    "admin1",
    "ne_10m_admin_1_states_provinces_lines",
    "1a1f30ccaaf4cc9c4bde34266f0b8cbb955d3a4cf254b756912255f2ec7c75b6",
  ],
];
mkdirSync(".cache/atlas", { recursive: true });
mkdirSync("public/atlas", { recursive: true });
const special: Record<string, string> = {
  FRA: "FR",
  NOR: "NO",
  KOS: "XK",
  CYN: "CY",
  SOL: "SO",
  SAH: "EH",
  SDS: "SS",
};
for (const [name, file, hash] of inputs) {
  const path = `.cache/atlas/${name}.geojson`;
  if (!existsSync(path))
    execFileSync("curl", [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--max-time",
      "180",
      `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/${file}.geojson`,
      "-o",
      path,
    ]);
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== hash)
    throw new Error(
      `Checksum mismatch: ${path}. Remove this cached file and retry. Never disable verification.`,
    );
  const output = `.cache/atlas/${name}-simple.json`;
  execFileSync(
    "node_modules/.bin/mapshaper",
    [
      path,
      "-simplify",
      name === "countries" ? "45%" : "9%",
      "keep-shapes",
      "-o",
      output,
      "format=geojson",
      "precision=0.0001",
      "force",
    ],
    { stdio: "inherit" },
  );
  const source = JSON.parse(readFileSync(output, "utf8")) as FeatureCollection;
  source.features = source.features.filter((f) => f.geometry !== null);
  if (name === "countries") {
    const labels: Feature<Point>[] = [];
    source.features = source.features.map((f, i) => {
      const p = f.properties!;
      const code =
        special[p.ADM0_A3] ??
        countryCode("", p.ISO_A2_EH) ??
        countryCode(p.NAME_EN || p.NAME) ??
        "";
      const properties = {
        code,
        name: p.NAME_EN || p.NAME,
        rank: p.LABELRANK,
        minLabel: p.MIN_LABEL,
      };
      if (p.LABEL_X != null && p.LABEL_Y != null)
        labels.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.LABEL_X, p.LABEL_Y] },
          properties,
        });
      return { ...f, id: i, properties };
    });
    writeFileSync(
      "public/atlas/labels.geojson",
      JSON.stringify({ type: "FeatureCollection", features: labels }),
    );
  } else
    source.features = source.features.map((f) => ({ ...f, properties: {} }));
  writeFileSync(`public/atlas/${name}.geojson`, JSON.stringify(source));
  console.log(`Prepared ${name}: ${source.features.length} features.`);
}
const grid: Feature<Geometry>[] = [];
for (let lon = -180; lon <= 180; lon += 15)
  grid.push({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: Array.from({ length: 89 }, (_, i) => [lon, -88 + i * 2]),
    },
  });
for (let lat = -75; lat <= 75; lat += 15)
  grid.push({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]),
    },
  });
writeFileSync(
  "public/atlas/graticule.geojson",
  JSON.stringify({ type: "FeatureCollection", features: grid }),
);
const fontDir = "public/fonts/Open Sans Semibold";
mkdirSync(fontDir, { recursive: true });
const glyphHashes: Record<string, string> = {
  "0-255": "64da7011e07531351a249a3d26aad76e2f22e4e321e50833f742697b453e8365",
  "256-511": "78298bbd8198c117ccdffe66bf9bbf646fdc1210b7e1bf222f5a9b29b366d7a5",
  "512-767": "0f4e1975dfdb1b4f48e5d069d1360992c2868f50669aa6180a7f5af8dce33238",
  "768-1023":
    "35f7d1f9c9dfbc978635b7eb21bffb1113879182b2d518a7fbee6b825dd08274",
  "1024-1279":
    "0354f1c092e3604b09177de773f84caa1ca6d4f17a8099e4787fcba8e7282907",
  "1280-1535":
    "99610a7d86481d9f9f89d1024c1aff68c96aba66220c0026ea385051c314787a",
};
for (const [range, hash] of Object.entries(glyphHashes)) {
  execFileSync("curl", [
    "-fsSL",
    "--max-time",
    "30",
    `https://raw.githubusercontent.com/maplibre/demotiles/gh-pages/font/Open%20Sans%20Semibold/${range}.pbf`,
    "-o",
    `${fontDir}/${range}.pbf`,
  ]);
  if (
    createHash("sha256")
      .update(readFileSync(`${fontDir}/${range}.pbf`))
      .digest("hex") !== hash
  )
    throw new Error(`Font checksum mismatch: ${range}.`);
}
console.log("Atlas and label glyphs ready. Natural Earth 5.1.2 · Open Sans.");
