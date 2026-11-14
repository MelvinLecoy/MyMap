import { readFileSync } from "node:fs";
import { importCities } from "./importer.js";
import { toCityRow, type CityRow } from "../src/lib/cloud-data.js";

export function collectionRows(): CityRow[] {
  const { data } = importCities(readFileSync("data/cities.csv", "utf8"), {
    coordinates: readFileSync("data/coordinates.csv", "utf8"),
    cityVisits: readFileSync("data/city-visit-history.csv", "utf8"),
    cityPeriods: readFileSync("data/city-visit-periods.csv", "utf8"),
  });
  return data.cities.map(toCityRow);
}

const columns = [
  "id",
  "name",
  "country",
  "country_code",
  "continent",
  "region",
  "subregion",
  "longitude",
  "latitude",
  "map_embed_url",
  "map_viewer_url",
  "map_status",
  "visit_status",
  "last_visited",
  "notes",
  "pin_color",
] as const;
const metadata = [
  "name",
  "country",
  "country_code",
  "continent",
  "region",
  "subregion",
  "longitude",
  "latitude",
  "map_embed_url",
  "map_viewer_url",
];
export function seedSql(rows: CityRow[]): string {
  const json = JSON.stringify(rows).replaceAll("'", "''");
  return `insert into public.cities (${columns.join(",")})
select ${columns.join(",")} from jsonb_populate_recordset(null::public.cities, '${json}'::jsonb)
on conflict (id) do update set ${metadata.map((c) => `${c}=excluded.${c}`).join(",")}
where row(${metadata.map((c) => `cities.${c}`).join(",")})
is distinct from row(${metadata.map((c) => `excluded.${c}`).join(",")});`;
}
