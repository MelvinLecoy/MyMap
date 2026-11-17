import geography from "../generated/country-geography.json";

// Experimental map presentation only; saved visit/plan statuses stay independent.
export const TESTING_PLANNED_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "RU",
  "UA",
  "BY",
  "VE",
  "CU",
  "PY",
  ...geography.countries
    .filter(
      (country) =>
        country.subregion === "Lesser Antilles" && country.code !== "TT",
    )
    .map((country) => country.code),
]);
