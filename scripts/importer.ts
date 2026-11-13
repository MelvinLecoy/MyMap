import { parse } from "csv-parse/sync";
import iso from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import { importCityHistory } from "./city-importer.js";
import { cityVisitSummary } from "../src/lib/city-visits.js";
import {
  MAP_STATUSES,
  type AtlasData,
  type City,
  type CountryVisit,
  type MapStatus,
  type VisitStatus,
} from "../src/lib/types.js";
iso.registerLocale(en);
type Row = { values: Record<string, string>; line: number };
export type Issue = { line: number; message: string };
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
export function readCSV(text: string, required: string[] = []): Row[] {
  const parsed = parse(text, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    info: true,
  }) as unknown as { record: string[]; info: { lines: number } }[];
  if (!parsed.length)
    throw new Error("The CSV is empty. Add a header and at least one city.");
  const headers = parsed[0].record.map((h) =>
    key(h) === "city" ? "cities" : key(h),
  );
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate CSV headers. Give every column a unique name.");
  const missing = required.filter((h) => !headers.includes(key(h)));
  if (missing.length)
    throw new Error(`Missing required CSV headers: ${missing.join(", ")}.`);
  return parsed.slice(1).map(({ record, info }) => ({
    line: info.lines,
    values: Object.fromEntries(
      headers.map((h, i) => [h, (record[i] ?? "").trim()]),
    ),
  }));
}
export function slug(name: string, country: string): string {
  return `${name}-${country}`
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}
const aliases: Record<string, string> = {
  russia: "RU",
  rusland: "RU",
  czechia: "CZ",
  "czech republic": "CZ",
  turkey: "TR",
  türkiye: "TR",
  "south korea": "KR",
  "north korea": "KP",
  vietnam: "VN",
  taiwan: "TW",
  uk: "GB",
  "united states": "US",
  usa: "US",
  "ivory coast": "CI",
  bolivia: "BO",
  iran: "IR",
  moldova: "MD",
  tanzania: "TZ",
  venezuela: "VE",
  laos: "LA",
  palestine: "PS",
  kosovo: "XK",
};
export function countryCode(name: string, explicit = ""): string | null {
  if (explicit) {
    const code = explicit.toUpperCase();
    return code.length === 2 && (iso.isValid(code) || code === "XK")
      ? code
      : null;
  }
  return aliases[name.toLowerCase()] ?? iso.getAlpha2Code(name, "en") ?? null;
}
export function parseMapLink(input: string): City["map"] {
  if (!input.trim()) return null;
  let raw = input.trim();
  if (raw.startsWith("<")) {
    if (!/^<iframe\b[\s\S]*<\/iframe>\s*$/i.test(raw))
      throw new Error("Expected a Google My Maps URL or one iframe.");
    const attributes = raw.slice(raw.indexOf(" "), raw.indexOf(">"));
    const matches = [
      ...attributes.matchAll(
        /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      ),
    ];
    if (matches.length !== 1 || (raw.match(/<iframe\b/gi) ?? []).length !== 1)
      throw new Error("The iframe must contain exactly one src.");
    raw = (matches[0][1] ?? matches[0][2] ?? matches[0][3]).replace(
      /&amp;/gi,
      "&",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The map URL is not valid.");
  }
  if (
    url.protocol !== "https:" ||
    !["www.google.com", "google.com", "maps.google.com"].includes(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Use an HTTPS Google My Maps URL on google.com, www.google.com, or maps.google.com.",
    );
  if (!/^\/maps\/d\/(?:u\/\d+\/)?(?:embed|viewer)\/?$/.test(url.pathname))
    throw new Error(
      "This is not a recognized Google My Maps embed or viewer path.",
    );
  const mid = url.searchParams.get("mid");
  if (
    !mid ||
    !/^[A-Za-z0-9_-]+$/.test(mid) ||
    mid.length > 256 ||
    url.searchParams.getAll("mid").length !== 1
  )
    throw new Error("The Google map ID is missing or invalid.");
  const embed = new URL("https://www.google.com/maps/d/embed");
  embed.searchParams.set("mid", mid);
  for (const name of ["ll", "z", "ehbc", "noprof"]) {
    const value = url.searchParams.get(name);
    if (value) embed.searchParams.set(name, value);
  }
  return {
    embedUrl: embed.href,
    viewerUrl: `https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(mid)}`,
  };
}
export function validDate(value: string): boolean {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (
    year < 1000 ||
    year > 9999 ||
    (month !== undefined && (month < 1 || month > 12))
  )
    return false;
  if (day === undefined) return true;
  return day > 0 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function coordinatePair(
  latitude: string,
  longitude: string,
): [number, number] | null {
  if (!latitude || !longitude) return null;
  const lat = Number(latitude),
    lon = Number(longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
    ? [lon, lat]
    : null;
}
export function importCities(
  csv: string,
  options: {
    demo?: boolean;
    coordinates?: string;
    countryVisits?: string;
    cityVisits?: string;
  } = {},
): { data: AtlasData; issues: Issue[] } {
  const issues: Issue[] = [];
  const issue = (line: number, message: string) =>
    issues.push({ line, message });
  const overrides = new Map<string, [number, number]>();
  if (options.coordinates)
    for (const { values: r, line } of readCSV(options.coordinates, [
      "CityId",
      "Latitude",
      "Longitude",
    ])) {
      if (overrides.has(r.cityid))
        throw new Error(
          `coordinates.csv row ${line}: duplicate CityId ${r.cityid}.`,
        );
      const coords = coordinatePair(r.latitude, r.longitude);
      if (coords && r.cityid) overrides.set(r.cityid, coords);
      else issue(line, "coordinates.csv: invalid CityId or coordinates.");
    }
  const ids = new Set<string>();
  const cities = readCSV(csv, [
    "Cities",
    "Country",
    "Continent",
    "Region",
    "SubRegion",
    "Status",
    "Link",
  ]).map(({ values: r, line }): City => {
    if (!r.cities || !r.country)
      throw new Error(`Row ${line}: Cities and Country cannot be empty.`);
    const id = r.cityid || slug(r.cities, r.country);
    if (!/^[\p{L}\p{N}_-]+$/u.test(id))
      throw new Error(
        `Row ${line}: CityId must contain only letters, numbers, hyphens or underscores.`,
      );
    if (ids.has(id))
      throw new Error(
        `Row ${line}: duplicate city ID "${id}". Set unique CityId values to disambiguate cities.`,
      );
    ids.add(id);
    const status =
      r.status.toLowerCase() === "done"
        ? "Complete"
        : MAP_STATUSES.find((s) => s.toLowerCase() === r.status.toLowerCase());
    if (!status)
      throw new Error(
        `Row ${line}: unrecognized or missing Status "${r.status}". Supported: ${MAP_STATUSES.join(", ")} (legacy Done is accepted).`,
      );
    const code = countryCode(r.country, r.countrycode);
    if (!code)
      issue(
        line,
        `Unmapped country "${r.country}". Supply an ISO alpha-2 CountryCode.`,
      );
    const supplied = Boolean(r.latitude || r.longitude);
    let coords = coordinatePair(r.latitude ?? "", r.longitude ?? "");
    if (supplied && !coords)
      issue(line, `Invalid latitude/longitude for ${r.cities}, ${r.country}.`);
    coords ??= overrides.get(id) ?? null;
    if (!coords)
      issue(
        line,
        `Missing location: ${r.cities}, ${r.country}. Add Latitude/Longitude or run data:resolve-coordinates.`,
      );
    let map: City["map"] = null;
    try {
      map = parseMapLink(r.link);
    } catch (err) {
      issue(line, `${r.cities}: ${(err as Error).message}`);
    }
    let visit: VisitStatus = "unknown";
    const flag = (r.visited ?? "").toLowerCase();
    if (flag === "yes") visit = "visited";
    else if (flag === "no") visit = "not-visited";
    else if (flag === "planned") visit = "planned";
    else if (flag)
      issue(line, `${r.cities}: Visited must be Yes, No, Planned, or blank.`);
    let date = r.lastvisited || null;
    if (date && !validDate(date)) {
      issue(
        line,
        `${r.cities}: invalid LastVisited "${date}"; use YYYY, YYYY-MM, or YYYY-MM-DD.`,
      );
      date = null;
    }
    if (date && (flag === "no" || flag === "planned")) {
      issue(
        line,
        `${r.cities}: Visited=${flag === "no" ? "No" : "Planned"} conflicts with LastVisited. Visit set to unknown until corrected.`,
      );
      visit = "unknown";
      date = null;
    } else if (date && !flag) visit = "visited";
    let pinColor = r.pincolor || null;
    if (pinColor && !/^#[0-9a-f]{6}$/i.test(pinColor)) {
      issue(line, `${r.cities}: invalid PinColor; using the default.`);
      pinColor = null;
    }
    return {
      id,
      name: r.cities,
      country: r.country,
      countryCode: code,
      continent: r.continent,
      region: r.region,
      subregion: r.subregion,
      coordinates: coords,
      status: status as MapStatus,
      visit,
      lastVisited: date,
      notes: r.notes || "",
      pinColor,
      map,
    };
  });
  const preparedCities = options.cityVisits
    ? importCityHistory(options.cityVisits, cities)
    : cities;
  if (options.cityVisits)
    for (const { values: r } of readCSV(csv)) {
      const city = preparedCities.find(
        (c) => c.id === (r.cityid || slug(r.cities, r.country)),
      )!;
      const summary = cityVisitSummary(city.visits ?? []);
      if (
        (r.recordedvisits && Number(r.recordedvisits) !== summary.visits) ||
        (r.recordeddaysspent && Number(r.recordeddaysspent) !== summary.days)
      )
        throw new Error(`City CSV totals differ from history: ${city.id}`);
    }
  const countryMap = new Map<string, CountryVisit>();
  for (const city of cities)
    if (city.countryCode) {
      const previous = countryMap.get(city.countryCode);
      countryMap.set(city.countryCode, {
        code: city.countryCode,
        visited: Boolean(previous?.visited || city.visit === "visited"),
        color: null,
      });
    }
  if (options.countryVisits) {
    const rows = readCSV(options.countryVisits, ["CountryCode"]);
    const seen = new Set<string>();
    for (const { values: r, line } of rows) {
      const code = countryCode("", r.countrycode);
      if (!code) {
        issue(
          line,
          `country-visits.csv: invalid country code "${r.countrycode}".`,
        );
        continue;
      }
      if (seen.has(code))
        throw new Error(
          `country-visits.csv row ${line}: duplicate CountryCode ${code}. Keep one row per code.`,
        );
      seen.add(code);
      const flag = r.visited?.toLowerCase();
      if (flag && flag !== "yes" && flag !== "no")
        issue(
          line,
          `country-visits.csv: Visited must be Yes, No, or blank for ${code}.`,
        );
      let color = r.fillcolor || null;
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
        issue(
          line,
          `country-visits.csv: invalid FillColor for ${code}; using the default.`,
        );
        color = null;
      }
      countryMap.set(code, {
        code,
        visited: Boolean(
          countryMap.get(code)?.visited ||
            flag === "yes" ||
            r.visited === undefined,
        ),
        color,
      });
    }
  }
  return {
    data: {
      demo: options.demo ?? false,
      cities: preparedCities,
      countries: [...countryMap.values()].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
      geonames: Boolean(options.coordinates),
    },
    issues,
  };
}
