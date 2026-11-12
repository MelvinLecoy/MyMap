import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { countryCode, coordinatePair, readCSV, slug } from "./importer.js";
const directory = process.argv[2] || "data/geonames";
for (const file of [
  `${directory}/cities500.txt`,
  `${directory}/countryInfo.txt`,
  "data/cities.csv",
])
  if (!existsSync(file)) {
    console.error(
      `Missing ${file}. Download cities500.zip and countryInfo.txt from https://download.geonames.org/export/dump/ and extract into ${directory}. Then run npm run data:resolve-coordinates -- ${directory}.`,
    );
    process.exit(1);
  }
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const countryNames = new Map<string, string>();
for (const line of readFileSync(`${directory}/countryInfo.txt`, "utf8").split(
  /\r?\n/,
)) {
  if (!line || line.startsWith("#")) continue;
  const c = line.split("\t");
  countryNames.set(normalize(c[4]), c[0]);
}
const existing = new Map<string, [number, number]>();
if (existsSync("data/coordinates.csv"))
  for (const { values: r, line } of readCSV(
    readFileSync("data/coordinates.csv", "utf8"),
    ["CityId", "Latitude", "Longitude"],
  )) {
    if (existing.has(r.cityid))
      throw new Error(`coordinates.csv row ${line}: duplicate ${r.cityid}.`);
    const coords = coordinatePair(r.latitude, r.longitude);
    if (!coords)
      throw new Error(
        `coordinates.csv row ${line}: fix the existing invalid coordinates before resolving.`,
      );
    existing.set(r.cityid, coords);
  }
const pending = readCSV(readFileSync("data/cities.csv", "utf8"), [
  "Cities",
  "Country",
])
  .map(({ values: r }) => ({
    cities: r.cities,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    id: r.cityid || slug(r.cities, r.country),
    code:
      countryCode(r.country, r.countrycode) ||
      countryNames.get(normalize(r.country)),
  }))
  .filter(
    (r) =>
      !existing.has(r.id) &&
      !coordinatePair(r.latitude || "", r.longitude || ""),
  );
const wanted = new Set(pending.map((r) => `${r.code}:${normalize(r.cities)}`));
const matches = new Map<string, Map<string, [number, number]>>();
const reader = createInterface({
  input: createReadStream(`${directory}/cities500.txt`),
  crlfDelay: Infinity,
});
for await (const line of reader) {
  const f = line.split("\t");
  const coords = coordinatePair(f[4], f[5]);
  if (!coords) continue;
  for (const name of new Set([f[1], f[2], ...(f[3] || "").split(",")])) {
    const key = `${f[8]}:${normalize(name)}`;
    if (wanted.has(key)) {
      if (!matches.has(key)) matches.set(key, new Map());
      matches.get(key)!.set(f[0], coords);
    }
  }
}
let resolved = 0;
for (const city of pending) {
  const result = matches.get(`${city.code}:${normalize(city.cities)}`);
  if (result?.size === 1) {
    existing.set(city.id, [...result.values()][0]);
    resolved++;
  } else
    console.warn(
      `${result?.size ? "Ambiguous" : "Missing"}: ${city.cities}, ${city.country} (${city.id}). Add a manual coordinate pair.`,
    );
}
mkdirSync("data", { recursive: true });
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
writeFileSync(
  "data/coordinates.csv",
  "CityId,Latitude,Longitude\n" +
    [...existing]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, [lon, lat]]) => `${quote(id)},${lat},${lon}`)
      .join("\n") +
    "\n",
);
console.log(
  `Saved ${resolved} new unique matches; ${existing.size} total coordinates. GeoNames, CC BY 4.0.`,
);
