export const MAP_STATUSES = [
  "Complete",
  "Update",
  "Unfinished",
  "Not Started",
] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];
export type VisitStatus = "visited" | "not-visited" | "unknown";
export interface City {
  id: string;
  name: string;
  country: string;
  countryCode: string | null;
  continent: string;
  region: string;
  subregion: string;
  coordinates: [number, number] | null;
  status: MapStatus;
  visit: VisitStatus;
  lastVisited: string | null;
  notes: string;
  pinColor: string | null;
  map: { embedUrl: string; viewerUrl: string } | null;
}
export interface CountryVisit {
  code: string;
  visited: boolean;
  color: string | null;
}
export interface AtlasData {
  demo: boolean;
  cities: City[];
  countries: CountryVisit[];
  geonames: boolean;
}
export const VISIT_LABELS: Record<VisitStatus, string> = {
  visited: "Visited",
  "not-visited": "Not visited",
  unknown: "Visit not recorded",
};
export function formatVisitDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!month) return String(year);
  const formatted = new Intl.DateTimeFormat("en", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
  return day ? `${day} ${formatted} ${year}` : `${formatted} ${year}`;
}
