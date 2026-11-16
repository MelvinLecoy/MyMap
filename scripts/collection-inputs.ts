import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

type Row = Record<string, string>;
const read = (path: string): Row[] =>
  parse(readFileSync(path, "utf8"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as Row[];
export function collectionCsv(
  rows: Row[],
  columns = [...new Set(rows.flatMap((row) => Object.keys(row)))],
) {
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return (
    [columns, ...rows.map((row) => columns.map((key) => row[key] ?? ""))]
      .map((row) => row.map(cell).join(","))
      .join("\n") + "\n"
  );
}

/** One reference per country; labels are presentation overrides, not city copies. */
export function countryInputReferences() {
  const references = new Map(
    read("data/reference/country-geography.csv").map((row) => [
      row.CountryCode,
      {
        code: row.CountryCode,
        name: row.Country,
        continent: row.Continent,
        region: row.Region,
        subregion: row.Subregion,
        cityLabel: row.Country,
      },
    ]),
  );
  const seen = new Set<string>();
  for (const row of read("data/reference/country-labels.csv")) {
    if (seen.has(row.CountryCode))
      throw new Error(`Duplicate country label: ${row.CountryCode}`);
    seen.add(row.CountryCode);
    let reference = references.get(row.CountryCode);
    if (!reference) {
      if (!row.NameFallback || !row.ContinentFallback)
        throw new Error(`Missing country reference: ${row.CountryCode}`);
      reference = {
        code: row.CountryCode,
        name: row.NameFallback,
        continent: row.ContinentFallback,
        region: row.RegionFallback ?? "",
        subregion: row.SubregionFallback ?? "",
        cityLabel: row.NameFallback,
      };
      references.set(row.CountryCode, reference);
    }
    if (row.CityLabel) reference.cityLabel = row.CityLabel;
  }
  return references;
}

function cityPeriods(): Row[] {
  return read("data/city-visit-periods.csv").map((row) => ({
    ...row,
    DaysSpent:
      "DaysSpent" in row
        ? row.DaysSpent
        : row.DaysSpentOverride ||
          String(
            (Date.parse(row.DepartureDate) - Date.parse(row.ArrivalDate)) /
              86400000 +
              1,
          ),
  }));
}

function cityVisits() {
  const groups = new Map<string, Row>();
  for (const period of cityPeriods()) {
    const key = `${period.CityId}:${period.VisitNumber}`;
    const previous = groups.get(key);
    groups.set(key, {
      CityId: period.CityId,
      VisitNumber: period.VisitNumber,
      ArrivalDate:
        previous && previous.ArrivalDate < period.ArrivalDate
          ? previous.ArrivalDate
          : period.ArrivalDate,
      DepartureDate:
        previous && previous.DepartureDate > period.DepartureDate
          ? previous.DepartureDate
          : period.DepartureDate,
      DaysSpent: String(
        Number(previous?.DaysSpent ?? 0) + Number(period.DaysSpent),
      ),
    });
  }
  return [...groups.values()];
}

export function derivedCityVisitsCsv() {
  return collectionCsv(cityVisits(), [
    "CityId",
    "VisitNumber",
    "ArrivalDate",
    "DepartureDate",
    "DaysSpent",
  ]);
}

/**
 * Expand the lean canonical files into the established import/exchange format.
 * These projections are generated in memory; derived values are never rewritten
 * into the repository. The original general CSV importer remains compatible.
 */
export function readCollectionCsv(path: string): string {
  if (path === "data/city-visit-periods.csv")
    return collectionCsv(cityPeriods(), [
      "CityId",
      "VisitNumber",
      "PeriodNumber",
      "ArrivalDate",
      "DepartureDate",
      "DaysSpent",
    ]);
  if (path === "data/cities.csv") {
    const input = read(path);
    if (input[0]?.Country !== undefined) return readFileSync(path, "utf8");
    const references = countryInputReferences();
    const latest = new Map<string, string>();
    for (const period of cityPeriods())
      if ((latest.get(period.CityId) ?? "") < period.DepartureDate)
        latest.set(period.CityId, period.DepartureDate);
    return collectionCsv(
      input.map((row) => {
        const country = references.get(row.CountryCode);
        if (!country) throw new Error(`Unknown country for city ${row.CityId}`);
        return {
          ...row,
          Country: country.cityLabel,
          Continent: country.continent,
          Region: country.region,
          SubRegion: country.subregion,
          Visited: latest.has(row.CityId)
            ? "Yes"
            : (row.VisitStatusOverride ?? row.Visited ?? ""),
          LastVisited: latest.get(row.CityId) ?? row.LastVisitedOverride ?? "",
        };
      }),
    );
  }
  if (path === "data/countries.csv") {
    const input = read(path);
    if (input[0]?.Country !== undefined) return readFileSync(path, "utf8");
    const references = countryInputReferences();
    const totals = new Map<string, { visits: Set<string>; days: number }>();
    for (const period of read("data/country-visit-periods.csv")) {
      const value = totals.get(period.CountryCode) ?? {
        visits: new Set<string>(),
        days: 0,
      };
      value.visits.add(period.VisitNumber);
      value.days += period.DaysSpent
        ? Number(period.DaysSpent)
        : (Date.parse(period.DepartureDate) - Date.parse(period.ArrivalDate)) /
            86400000 +
          1;
      totals.set(period.CountryCode, value);
    }
    return collectionCsv(
      input.map((row) => {
        const reference = references.get(row.CountryCode);
        if (!reference) throw new Error(`Unknown country ${row.CountryCode}`);
        const value = totals.get(row.CountryCode);
        return {
          ...row,
          Country: reference.name,
          Continent: reference.continent,
          RecordedVisits: value ? String(value.visits.size) : "",
          RecordedDaysSpent: value ? String(value.days) : "",
        };
      }),
    );
  }
  if (path === "data/country-visit-history.csv") {
    const input = read(path);
    if (input[0]?.ArrivalDate !== undefined) return readFileSync(path, "utf8");
    const references = countryInputReferences();
    const groups = new Map<string, Row[]>();
    for (const period of read("data/country-visit-periods.csv")) {
      const key = `${period.CountryCode}:${period.VisitNumber}`;
      const periods = groups.get(key) ?? [];
      periods.push(period);
      groups.set(key, periods);
    }
    return collectionCsv(
      input.map((row) => {
        const periods = groups.get(`${row.CountryCode}:${row.VisitNumber}`);
        const dates = periods
          ?.flatMap((period) => [period.ArrivalDate, period.DepartureDate])
          .sort();
        return {
          ...row,
          Country: references.get(row.CountryCode)?.name ?? "",
          ArrivalDate: row.ArrivalDateOverride || dates?.[0] || "",
          DepartureDate: row.DepartureDateOverride || dates?.at(-1) || "",
          DaysSpent:
            row.DaysSpentOverride ||
            (periods
              ? String(
                  periods.reduce(
                    (sum, period) =>
                      sum +
                      (period.DaysSpent
                        ? Number(period.DaysSpent)
                        : (Date.parse(period.DepartureDate) -
                            Date.parse(period.ArrivalDate)) /
                            86400000 +
                          1),
                    0,
                  ),
                )
              : ""),
        };
      }),
    );
  }
  if (path === "data/country-visit-periods.csv") {
    const references = countryInputReferences();
    return collectionCsv(
      read(path).map((row) => ({
        ...row,
        Country: references.get(row.CountryCode)?.name ?? "",
      })),
    );
  }
  return readFileSync(path, "utf8");
}

const canonicalPaths = [
  "data/cities.csv",
  "data/countries.csv",
  "data/city-visit-periods.csv",
  "data/country-visit-history.csv",
  "data/country-visit-periods.csv",
];
const redundant: Record<string, string[]> = {
  "data/cities.csv": [
    "Country",
    "Continent",
    "Region",
    "SubRegion",
    "Visited",
    "LastVisited",
    "RecordedVisits",
    "RecordedDaysSpent",
  ],
  "data/countries.csv": [
    "Country",
    "Continent",
    "RecordedVisits",
    "RecordedDaysSpent",
  ],
  "data/city-visit-periods.csv": ["Cities", "CountryCode", "DaysSpent"],
  "data/country-visit-history.csv": [
    "Country",
    "ArrivalDate",
    "DepartureDate",
    "DaysSpent",
  ],
  "data/country-visit-periods.csv": ["Country"],
};

export function verifyConciseInputs() {
  for (const path of canonicalPaths) {
    const columns = (
      parse(readFileSync(path, "utf8"), { bom: true, to: 1 }) as string[][]
    )[0];
    const duplicated = redundant[path].filter((field) =>
      columns.includes(field),
    );
    if (duplicated.length)
      throw new Error(
        `${path}: redundant source fields ${duplicated.join(", ")}; run npm run data:normalize.`,
      );
  }
  if (existsSync("data/city-visit-history.csv"))
    throw new Error(
      "Counted city visits are derived from stays; remove the maintained aggregate CSV with data:normalize.",
    );
}

/** Retain the old preparation commands without reintroducing stored projections. */
export async function normalizeCollectionInputs() {
  const { csvData } = await import("./data-integrity");
  const before = csvData();
  if (existsSync("data/city-visit-history.csv")) {
    const legacy = read("data/city-visit-history.csv");
    const expected = new Map(
      cityVisits().map((row) => [row.CityId + ":" + row.VisitNumber, row]),
    );
    const seen = new Set<string>();
    for (const row of legacy) {
      const key = row.CityId + ":" + row.VisitNumber;
      const actual = expected.get(key);
      if (
        seen.has(key) ||
        !actual ||
        row.ArrivalDate !== actual.ArrivalDate ||
        row.DepartureDate !== actual.DepartureDate ||
        Number(row.DaysSpent) !== Number(actual.DaysSpent)
      )
        throw new Error(
          "Legacy city visit CSV has information not reproducible from stays; it was retained.",
        );
      if (
        Object.entries(row).some(
          ([field, value]) =>
            value &&
            ![
              "CityId",
              "Cities",
              "CountryCode",
              "VisitNumber",
              "ArrivalDate",
              "DepartureDate",
              "DaysSpent",
            ].includes(field),
        )
      )
        throw new Error(
          "Legacy city visit CSV contains independent fields; it was retained.",
        );
      seen.add(key);
    }
    if (seen.size !== expected.size)
      throw new Error(
        "Legacy city visit CSV and actual stays differ; it was retained.",
      );
  }
  const backup = new Map(
    [...canonicalPaths, "data/city-visit-history.csv"].map((path) => [
      path,
      existsSync(path) ? readFileSync(path) : null,
    ]),
  );
  const input = new Map(
    canonicalPaths.map((path) => [
      path,
      parse(readCollectionCsv(path), {
        bom: true,
        columns: true,
        skip_empty_lines: true,
      }) as Row[],
    ]),
  );
  const periods = input.get("data/city-visit-periods.csv")!;
  const visited = new Set(periods.map((period) => period.CityId));
  const countryGroups = new Map<string, Row[]>();
  for (const period of input.get("data/country-visit-periods.csv")!) {
    const key = period.CountryCode + ":" + period.VisitNumber;
    const group = countryGroups.get(key) ?? [];
    group.push(period);
    countryGroups.set(key, group);
  }
  try {
    for (const path of canonicalPaths) {
      const rows = input.get(path)!.map((row) => {
        const out = Object.fromEntries(
          Object.entries(row).filter(
            ([field]) => !redundant[path].includes(field),
          ),
        );
        if (path === "data/cities.csv") {
          out.VisitStatusOverride = visited.has(row.CityId) ? "" : row.Visited;
          if (visited.has(row.CityId)) delete out.LastVisitedOverride;
          if (!visited.has(row.CityId) && row.LastVisited)
            out.LastVisitedOverride = row.LastVisited;
        } else if (path === "data/city-visit-periods.csv") {
          const span =
            (Date.parse(row.DepartureDate) - Date.parse(row.ArrivalDate)) /
              86400000 +
            1;
          out.DaysSpentOverride =
            Number(row.DaysSpent) === span ? "" : row.DaysSpent;
        } else if (path === "data/country-visit-history.csv") {
          const known = countryGroups.has(
            row.CountryCode + ":" + row.VisitNumber,
          );
          for (const field of ["ArrivalDate", "DepartureDate", "DaysSpent"])
            out[field + "Override"] = known ? "" : row[field];
        }
        return out;
      });
      writeFileSync(path, collectionCsv(rows));
    }
    if (existsSync("data/city-visit-history.csv"))
      unlinkSync("data/city-visit-history.csv");
    if (!isDeepStrictEqual(before, csvData()))
      throw new Error(
        "Normalization changed published business data; restoring the source files.",
      );
    verifyConciseInputs();
    // Templates contain headers, never obsolete copies of the owner's records.
    for (const [source, target] of [
      ["data/countries.csv", "countries-template.csv"],
      ["data/country-visit-history.csv", "country-visits-template.csv"],
      ["data/country-visit-periods.csv", "country-visit-periods-template.csv"],
    ])
      writeFileSync(
        "data/templates/" + target,
        readFileSync(source, "utf8").split(/\r?\n/)[0] + "\n",
      );
  } catch (error) {
    for (const [path, bytes] of backup)
      if (bytes) writeFileSync(path, bytes);
      else if (existsSync(path)) unlinkSync(path);
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes("--project"))
    process.stdout.write(readCollectionCsv(process.argv.at(-1)!));
  else {
    verifyConciseInputs();
    console.log("Verified concise canonical CSV fields.");
  }
}
