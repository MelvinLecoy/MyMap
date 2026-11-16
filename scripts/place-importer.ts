import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseMapLink, readCSV } from "./importer";
import { fromPlaceRow, type PlaceRow } from "../src/lib/places";
import type { CountrySeed } from "../src/lib/countries";

export function importPlaces(
  csv: string,
  associations: string,
  countries: CountrySeed[],
  publicRoot = "public",
) {
  const countryNames = new Map(
    countries.map((country) => [country.code, country.name]),
  );
  const linked = new Map<string, { code: string; name: string }[]>();
  for (const { values: row } of readCSV(associations, [
    "PlaceId",
    "CountryCode",
  ])) {
    const name = countryNames.get(row.countrycode);
    if (!name) throw new Error(`Unknown place country: ${row.countrycode}`);
    const list = linked.get(row.placeid) ?? [];
    if (list.some((country) => country.code === row.countrycode))
      throw new Error("Duplicate place country association.");
    list.push({ code: row.countrycode, name });
    linked.set(row.placeid, list);
  }
  const ids = new Set<string>();
  const places = readCSV(csv, [
    "PlaceId",
    "Place",
    "Longitude",
    "Latitude",
    "OutlineFile",
    "MapStatus",
  ]).map(({ values: row }) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(row.placeid) || ids.has(row.placeid))
      throw new Error("Missing or duplicate place ID.");
    ids.add(row.placeid);
    let outline = null;
    if (row.outlinefile) {
      const path = resolve(join(publicRoot, row.outlinefile));
      if (
        !path.startsWith(resolve(publicRoot) + "/") ||
        !path.endsWith(".geojson")
      )
        throw new Error("A place outline must be a bundled GeoJSON file.");
      const geo = JSON.parse(readFileSync(path, "utf8"));
      outline =
        geo.type === "Feature"
          ? geo.geometry
          : geo.type === "FeatureCollection" && geo.features.length === 1
            ? geo.features[0].geometry
            : geo;
    }
    if (row.longitude === "" || row.latitude === "")
      throw new Error("A place needs a pin position.");
    const map = parseMapLink(
      row.link || row.mapembedurl || row.mapviewerurl || "",
    );
    if (
      [row.link, row.mapembedurl, row.mapviewerurl]
        .filter(Boolean)
        .some((link) => parseMapLink(link)?.viewerUrl !== map?.viewerUrl)
    )
      throw new Error("Place map links must identify the same map.");
    const result = fromPlaceRow({
      id: row.placeid,
      name: row.place,
      countries: linked.get(row.placeid) ?? [],
      continent: row.continent,
      region: row.region ?? "",
      subregion: row.subregion ?? "",
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      map_status: row.mapstatus,
      visit_status: row.visitstatus || "unknown",
      last_visited: row.lastvisited || null,
      notes: row.notes ?? "",
      pin_color: row.pincolor || null,
      map_embed_url: map?.embedUrl ?? null,
      map_viewer_url: map?.viewerUrl ?? null,
      outline,
      outline_source: row.outlinesource ?? "",
    } as PlaceRow);
    return result;
  });
  for (const id of linked.keys())
    if (!ids.has(id))
      throw new Error("Country association references an unknown place.");
  return places;
}
