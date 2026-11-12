import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readCSV } from "../scripts/importer.js";
test("GeoNames resolver saves unique primary/alternate matches, rejects ambiguity and preserves saved pairs", () => {
  const root = mkdtempSync(join(tmpdir(), "elsewhere-geonames-"));
  try {
    mkdirSync(join(root, "data/geonames"), { recursive: true });
    writeFileSync(
      join(root, "data/cities.csv"),
      "Cities,Country,Continent,Region,SubRegion,Status,Link\nKyiv,Ukraine,Europe,,,Complete,\nDuplicate,Poland,Europe,,,Update,\nMissing,Poland,Europe,,,Not Started,\nSaved,Poland,Europe,,,Unfinished,\nAlternate,Poland,Europe,,,Complete,",
    );
    writeFileSync(
      join(root, "data/coordinates.csv"),
      "CityId,Latitude,Longitude\nsaved-poland,0,0\n",
    );
    writeFileSync(
      join(root, "data/geonames/countryInfo.txt"),
      "# ISO\tISO3\tNumeric\tfips\tCountry\nUA\tUKR\t804\tUP\tUkraine\nPL\tPOL\t616\tPL\tPoland\n",
    );
    const geoname = (
      id: string,
      name: string,
      country: string,
      lat: string,
      lon: string,
      alternate = "",
    ) => [id, name, name, alternate, lat, lon, "P", "PPL", country].join("\t");
    writeFileSync(
      join(root, "data/geonames/cities500.txt"),
      [
        geoname("1", "Kyiv", "UA", "50.45", "30.52", "Kiev"),
        geoname("2", "Duplicate", "PL", "50", "20"),
        geoname("3", "Duplicate", "PL", "51", "21"),
        geoname("4", "Different name", "PL", "52", "22", "Alternate"),
        geoname("5", "Saved", "PL", "53", "23"),
        geoname("6", "Kyiv", "US", "40", "-80"),
      ].join("\n"),
    );
    const command = () =>
      spawnSync(
        process.execPath,
        [
          "--import",
          resolve("node_modules/tsx/dist/loader.mjs"),
          resolve("scripts/resolve-coordinates.ts"),
        ],
        { cwd: root, encoding: "utf8" },
      );
    const result = command();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ambiguous: Duplicate, Poland/);
    assert.match(result.stderr, /Missing: Missing, Poland/);
    const output = readFileSync(join(root, "data/coordinates.csv"), "utf8");
    const rows = readCSV(output);
    assert.equal(rows.length, 3);
    assert.equal(
      rows.find((r) => r.values.cityid === "saved-poland")?.values.latitude,
      "0",
    );
    assert.equal(
      rows.find((r) => r.values.cityid === "kyiv-ukraine")?.values.longitude,
      "30.52",
    );
    assert.equal(
      rows.find((r) => r.values.cityid === "alternate-poland")?.values
        .longitude,
      "22",
    );
    assert.equal(command().status, 0);
    assert.equal(
      readFileSync(join(root, "data/coordinates.csv"), "utf8"),
      output,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
