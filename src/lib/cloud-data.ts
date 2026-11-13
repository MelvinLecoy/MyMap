import {
  MAP_STATUSES,
  type City,
  type MapStatus,
  type CountryVisit,
} from "./types";
import { cityVisitSummary } from "./city-visits";

export interface CityRow {
  id: string;
  name: string;
  country: string;
  country_code: string | null;
  continent: string;
  region: string;
  subregion: string;
  longitude: number | null;
  latitude: number | null;
  map_embed_url: string | null;
  map_viewer_url: string | null;
  map_status: MapStatus;
  visit_status: City["visit"];
  last_visited: string | null;
  notes: string;
  pin_color: string | null;
  updated_at?: string;
}

export function toCityRow(city: City): CityRow {
  return {
    id: city.id,
    name: city.name,
    country: city.country,
    country_code: city.countryCode,
    continent: city.continent,
    region: city.region,
    subregion: city.subregion,
    longitude: city.coordinates?.[0] ?? null,
    latitude: city.coordinates?.[1] ?? null,
    map_embed_url: city.map?.embedUrl ?? null,
    map_viewer_url: city.map?.viewerUrl ?? null,
    map_status: city.status,
    visit_status: city.visit,
    last_visited: city.lastVisited,
    notes: city.notes,
    pin_color: city.pinColor,
  };
}

function safeMapUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ["google.com", "www.google.com", "maps.google.com"].includes(
        url.hostname,
      ) &&
      /^\/maps\/d\/(?:u\/\d+\/)?(?:embed|viewer)$/.test(url.pathname) &&
      /^[\w-]+$/.test(url.searchParams.get("mid") ?? "")
    );
  } catch {
    return false;
  }
}

export function fromCityRow(row: CityRow): City {
  if (
    !row.id ||
    !row.name ||
    !row.country ||
    !MAP_STATUSES.includes(row.map_status) ||
    !["visited", "planned", "not-visited", "unknown"].includes(row.visit_status)
  )
    throw new Error("The saved collection contains an invalid city.");
  const coordinates: City["coordinates"] =
    typeof row.longitude === "number" &&
    typeof row.latitude === "number" &&
    Number.isFinite(row.longitude) &&
    Number.isFinite(row.latitude) &&
    Math.abs(row.longitude) <= 180 &&
    Math.abs(row.latitude) <= 90
      ? [row.longitude, row.latitude]
      : null;
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    countryCode: row.country_code,
    continent: row.continent,
    region: row.region,
    subregion: row.subregion,
    coordinates,
    status: row.map_status,
    visit: row.visit_status,
    lastVisited: row.last_visited,
    notes: row.notes ?? "",
    pinColor: row.pin_color,
    map:
      safeMapUrl(row.map_embed_url) && safeMapUrl(row.map_viewer_url)
        ? { embedUrl: row.map_embed_url, viewerUrl: row.map_viewer_url }
        : null,
  };
}

export function deriveCountries(
  cities: City[],
  initial: CountryVisit[],
): CountryVisit[] {
  const countries = new Map(
    initial.map((c) => [c.code, { ...c, visited: false }]),
  );
  for (const city of cities)
    if (city.countryCode) {
      const country = countries.get(city.countryCode) ?? {
        code: city.countryCode,
        visited: false,
        color: null,
      };
      if (city.visit === "visited") country.visited = true;
      countries.set(country.code, country);
    }
  return [...countries.values()];
}

export const CITY_EXPORT_HEADERS = [
  "CityId",
  "Cities",
  "Country",
  "CountryCode",
  "Continent",
  "Region",
  "SubRegion",
  "Latitude",
  "Longitude",
  "Status",
  "Visited",
  "LastVisited",
  "RecordedVisits",
  "RecordedDaysSpent",
  "Link",
  "Notes",
  "PinColor",
] as const;

export function exportCitiesCsv(cities: City[]): string {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return (
    [
      CITY_EXPORT_HEADERS,
      ...cities.map((c) => [
        c.id,
        c.name,
        c.country,
        c.countryCode,
        c.continent,
        c.region,
        c.subregion,
        c.coordinates?.[1],
        c.coordinates?.[0],
        c.status,
        c.visit === "visited"
          ? "Yes"
          : c.visit === "planned"
            ? "Planned"
            : c.visit === "not-visited"
              ? "No"
              : "",
        c.lastVisited,
        c.visits?.length ? cityVisitSummary(c.visits).visits : null,
        c.visits?.length ? cityVisitSummary(c.visits).days : null,
        c.map?.embedUrl,
        c.notes,
        c.pinColor,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
