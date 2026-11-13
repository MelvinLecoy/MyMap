import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleDashed,
} from "lucide-react";
import {
  VISIT_LABELS,
  type City,
  type MapStatus,
  type VisitStatus,
} from "../lib/types";
import { countryDisplayName, type CountryRecord } from "../lib/countries";

export function Flag({ code }: { code: string | null }) {
  return (
    <span className="country-flag" aria-hidden="true">
      {code
        ? [...code.toUpperCase()]
            .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
            .join("")
        : "◌"}
    </span>
  );
}

export function Status({ status }: { status: MapStatus }) {
  return (
    <span
      className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}

export function VisitMarker({
  visit,
  inline = false,
}: {
  visit: VisitStatus;
  inline?: boolean;
}) {
  const state = visit === "visited" || visit === "planned" ? visit : "not-yet";
  const Icon =
    state === "visited"
      ? CircleCheck
      : state === "planned"
        ? CalendarDays
        : CircleDashed;
  return (
    <span
      className={
        inline
          ? `visit-value visit-value-${state}`
          : `visit-marker visit-marker-${state}`
      }
    >
      <Icon size={inline ? 18 : 20} strokeWidth={1.6} aria-hidden="true" />
      <span>{VISIT_LABELS[visit]}</span>
    </span>
  );
}

export function CountryVisitMarker({ country }: { country: CountryRecord }) {
  if (country.visit !== "visited") return <VisitMarker visit={country.visit} />;
  const count = country.timesVisited ?? country.recordedVisits;
  const label = count == null ? "Visited" : count === 1 ? "Visit" : "Visits";
  const latest = (country.visits ?? [])
    .flatMap((visit) =>
      visit.periods?.length
        ? visit.periods.map((period) => period.departure)
        : [visit.departure ?? visit.arrival],
    )
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const month =
    latest && /^\d{4}-\d{2}/.test(latest)
      ? [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ][Number(latest.slice(5, 7)) - 1]
      : null;
  const date = month && latest ? `${month} ${latest.slice(2, 4)}` : "";
  return (
    <span
      className="country-visit-summary"
      title={`${count ?? "Unknown"} ${count === 1 ? "visit" : "visits"}${date ? ` · Last visit ${date}` : ""}`}
    >
      <span className="visit-marker visit-marker-visited country-count-badge">
        <strong className="country-visit-count">{count ?? "—"}</strong>
        <span className="country-visit-label">{label}</span>
      </span>
      <span
        className="country-last-visit"
        data-year={date ? latest?.slice(0, 4) : undefined}
        aria-hidden={!date}
      >
        {date}
      </span>
    </span>
  );
}

export function CityRow({
  city,
  onSelect,
}: {
  city: City;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="city-row"
      onClick={() => onSelect(city.id)}
    >
      <VisitMarker visit={city.visit} />
      <span className="city-row-body">
        <span className="city-row-name">{city.name}</span>
        <span className="city-row-country">
          <Flag code={city.countryCode} />
          <span>{countryDisplayName(city.country, city.countryCode)}</span>
        </span>
        {city.visit === "visited" && city.lastVisited && (
          <span className="city-row-year">
            <span className="visually-hidden">Last visited </span>
            {city.lastVisited.slice(0, 4)}
          </span>
        )}
        {!city.coordinates && (
          <span className="location-missing">Location missing</span>
        )}
      </span>
      <Status status={city.status} />
      <ChevronRight className="row-chevron" size={14} aria-hidden="true" />
    </button>
  );
}
