import { readCSV } from "./importer.js";
import {
  attachCityVisits,
  type CityVisitRow,
} from "../src/lib/city-cloud-data.js";
import type { City } from "../src/lib/types.js";

export function importCityHistory(csv: string, cities: City[]): City[] {
  const byId = new Map(cities.map((c) => [c.id, c]));
  const rows = readCSV(csv, [
    "CityId",
    "VisitNumber",
    "ArrivalDate",
    "DepartureDate",
    "DaysSpent",
  ]).map(({ values: r, line }): CityVisitRow => {
    const city = byId.get(r.cityid);
    if (
      !city ||
      (r.cities && r.cities !== city.name) ||
      (r.countrycode && r.countrycode !== city.countryCode)
    )
      throw new Error(
        `City history row ${line}: unknown or mismatched city ${r.cityid}.`,
      );
    if (
      !/^[1-9]\d*$/.test(r.visitnumber) ||
      !/^(?:0|[1-9]\d*)(?:\.5)?$/.test(r.daysspent)
    )
      throw new Error(
        `City history row ${line}: invalid visit number or half-day duration.`,
      );
    return {
      city_id: r.cityid,
      visit_number: Number(r.visitnumber),
      arrival_date: r.arrivaldate,
      departure_date: r.departuredate,
      days_spent: Number(r.daysspent),
    };
  });
  return attachCityVisits(cities, rows);
}
