import type { CountrySeed } from "./countries";
import type { City } from "./types";

export interface CountryGeography {
  code: string;
  name: string;
  continent: string;
  region: string;
  subregion: string;
}

/** Runtime additions retain unknown geography; imports can require strict coverage. */
export function applyCityGeography<
  T extends Pick<
    City,
    "id" | "countryCode" | "continent" | "region" | "subregion"
  >,
>(
  cities: T[],
  reference: CountryGeography[],
  options: { strict?: boolean } = {},
): T[] {
  const byCode = new Map(reference.map((row) => [row.code, row]));
  return cities.map((city) => {
    if (city.countryCode === "SJ") return { ...city };
    const geography = city.countryCode
      ? byCode.get(city.countryCode)
      : undefined;
    if (!geography) {
      if (options.strict)
        throw new Error(
          `City ${city.id} needs an explicitly classified CountryCode; no country is inferred.`,
        );
      return { ...city };
    }
    return {
      ...city,
      continent: geography.continent,
      region: geography.region,
      subregion: geography.subregion,
    };
  });
}

/** Apply repo reference data after any mutable database snapshot has loaded. */
export function applyCountryGeography<T extends CountrySeed>(
  countries: T[],
  reference: CountryGeography[],
): T[] {
  const byCode = new Map(reference.map((row) => [row.code, row]));
  return countries.map((country) => {
    const geography = byCode.get(country.code);
    return {
      ...country,
      continent: geography?.continent ?? country.continent,
      // No classification is invented for territories absent from the source.
      region: geography?.region ?? "",
      subregion: geography?.subregion ?? "",
    };
  });
}
