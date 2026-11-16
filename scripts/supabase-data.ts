import { derivedCityVisitsCsv, readCollectionCsv } from "./collection-inputs";
import { readFileSync } from "node:fs";
import { importCities } from "./importer.js";
import { toCityRow, type CityRow } from "../src/lib/cloud-data.js";

export function collectionRows(): CityRow[] {
  const { data } = importCities(readCollectionCsv("data/cities.csv"), {
    coordinates: readFileSync("data/coordinates.csv", "utf8"),
    cityVisits: derivedCityVisitsCsv(),
    cityPeriods: readCollectionCsv("data/city-visit-periods.csv"),
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
select ${columns.map((c) => `s.${c}`).join(",")} from jsonb_populate_recordset(null::public.cities, '${json}'::jsonb) s
where not exists(select 1 from public.cities t where t.id=s.id);
update public.cities t set ${metadata.map((c) => `${c}=s.${c}`).join(",")}
from jsonb_populate_recordset(null::public.cities, '${json}'::jsonb) s
where t.id=s.id and row(${metadata.map((c) => `t.${c}`).join(",")})
is distinct from row(${metadata.map((c) => `s.${c}`).join(",")});`;
}
