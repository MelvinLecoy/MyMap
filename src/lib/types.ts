export const MAP_STATUSES = [
  "Complete",
  "Update",
  "Unfinished",
  "Not Started",
] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];
// Keep stored status keys stable while naming their categories consistently in the UI.
export const MAP_STATUS_LABELS: Record<MapStatus, string> = {
  Complete: "Complete",
  Update: "Usable",
  Unfinished: "Update",
  "Not Started": "Not Started",
};
export type VisitStatus = "visited" | "planned" | "not-visited" | "unknown";
export interface CityStayPeriod {
  number: number;
  arrival: string;
  departure: string;
  daysSpent: number;
}
export interface CityVisit extends CityStayPeriod {
  periods?: CityStayPeriod[];
}
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
  visits?: CityVisit[];
  notes: string;
  pinColor: string | null;
  map: { embedUrl: string; viewerUrl: string } | null;
}
export interface CountryVisit {
  code: string;
  visited: boolean;
  color: string | null;
  lastVisited?: string | null;
}
export interface AtlasData {
  demo: boolean;
  cities: City[];
  countries: CountryVisit[];
  geonames: boolean;
}
export const VISIT_LABELS: Record<VisitStatus, string> = {
  visited: "Visited",
  planned: "Planned",
  "not-visited": "Not Yet",
  unknown: "Not Yet",
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

export function formatShortVisitDate(date: string): string {
  const [year, month] = date.split("-");
  if (!month) return year;
  return `${year.slice(2)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1]}`;
}
