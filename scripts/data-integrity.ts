import { cityCollection } from "./city-database.js";
import { countryCollection } from "./country-database.js";
import { fromCityRow, toCityRow } from "../src/lib/cloud-data.js";
import {
  readCitySnapshot,
  toCityVisitRows,
  toCityPeriodRows,
  type CitySnapshot,
} from "../src/lib/city-cloud-data.js";
import {
  fromCountrySnapshot,
  toCountrySnapshot,
  type CountrySnapshot,
} from "../src/lib/country-cloud-data.js";

export interface PersistentData {
  cities: CitySnapshot;
  countries: CountrySnapshot;
}

export function csvData(): PersistentData {
  const cities = cityCollection();
  return {
    cities: {
      cities: cities.map(toCityRow),
      visits: toCityVisitRows(cities),
      periods: toCityPeriodRows(cities),
    },
    countries: toCountrySnapshot(countryCollection()),
  };
}

/** Compare all CSV business fields; database revision timestamps are independent. */
export function verifyData(value: PersistentData, expected = csvData()) {
  const citySnapshot = readCitySnapshot(value.cities);
  const countries = fromCountrySnapshot(value.countries);
  const actual = {
    cities: {
      cities: citySnapshot.cities.map((row) => toCityRow(fromCityRow(row))),
      visits: citySnapshot.visits,
      periods: citySnapshot.periods,
    },
    countries: toCountrySnapshot(countries),
  };
  const issues: string[] = [];
  if (!Array.isArray(value.cities.periods))
    issues.push(
      "city_visit_periods: missing from database snapshot; apply the city grouping migration.",
    );
  const compare = (
    name: string,
    rows: object[],
    reference: object[],
    keys: string[],
  ) => {
    const keyed = (row: object) =>
      keys.map((key) => (row as Record<string, unknown>)[key]).join(":");
    const found = new Map(
      rows.map((row) => [keyed(row), row as Record<string, unknown>]),
    );
    const wanted = new Set(reference.map(keyed));
    for (const row of reference) {
      const id = keyed(row),
        current = found.get(id);
      if (!current) {
        issues.push(`${name}: missing ${id}`);
        continue;
      }
      for (const [field, value] of Object.entries(row))
        if (JSON.stringify(current[field]) !== JSON.stringify(value))
          issues.push(`${name}: ${id}.${field} differs from CSV`);
    }
    for (const row of rows)
      if (!wanted.has(keyed(row)))
        issues.push(`${name}: unexpected ${keyed(row)}`);
  };
  compare("cities", actual.cities.cities, expected.cities.cities, ["id"]);
  compare("city_visits", actual.cities.visits, expected.cities.visits, [
    "city_id",
    "visit_number",
  ]);
  compare(
    "city_visit_periods",
    actual.cities.periods,
    expected.cities.periods,
    ["city_id", "visit_number", "period_number"],
  );
  compare(
    "countries",
    actual.countries.countries,
    expected.countries.countries,
    ["code"],
  );
  compare(
    "country_visits",
    actual.countries.visits,
    expected.countries.visits,
    ["country_code", "visit_number"],
  );
  compare(
    "country_visit_periods",
    actual.countries.periods,
    expected.countries.periods,
    ["country_code", "visit_number", "period_number"],
  );
  const byCode = new Map(countries.map((c) => [c.code, c]));
  for (const city of actual.cities.cities) {
    const country = city.country_code
      ? byCode.get(city.country_code)
      : undefined;
    if (!country)
      issues.push(`cities: ${city.id} references a missing country`);
    else if (city.visit_status === "visited" && country.visit !== "visited")
      issues.push(`cities: ${city.id} is visited but its country is not`);
  }
  return {
    matches: issues.length === 0,
    issues,
    counts: {
      cities: actual.cities.cities.length,
      visitedCities: actual.cities.cities.filter(
        (c) => c.visit_status === "visited",
      ).length,
      cityVisits: actual.cities.visits.length,
      cityStays: actual.cities.periods.length,
      cityDays: actual.cities.visits.reduce((n, v) => n + v.days_spent, 0),
      countries: countries.length,
      countryVisits: actual.countries.visits.length,
      countryPeriods: actual.countries.periods.length,
      countryDays: countries.reduce(
        (n, c) => n + (c.recordedDaysSpent ?? 0),
        0,
      ),
    },
  };
}
