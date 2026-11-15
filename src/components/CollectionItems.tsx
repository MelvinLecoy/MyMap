import { useId } from "react";
import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleDashed,
} from "lucide-react";
import {
  VISIT_LABELS,
  MAP_STATUS_LABELS,
  type City,
  type MapStatus,
  type VisitStatus,
} from "../lib/types";
import {
  countryDisplayName,
  latestCountryVisit,
  countryVisitSummary,
  countryVisitOrderLabel,
  type CountryRecord,
} from "../lib/countries";
import { VISIT_YEAR_COLORS } from "../lib/palette";
import { cityVisitSummary } from "../lib/city-visits";
import { formatShortVisitDate } from "../lib/types";
import { cityProfileHref, followProfileLink } from "../lib/profile-navigation";
import { isPlace } from "../lib/places";

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

export function EntryCountries({ entry }: { entry: City }) {
  if (!isPlace(entry))
    return (
      <>
        <Flag code={entry.countryCode} />
        <span>{countryDisplayName(entry.country, entry.countryCode)}</span>
      </>
    );
  return (
    <>
      {entry.countries.map((country) => (
        <span key={country.code} className="entry-country">
          <Flag code={country.code} />
          <span>{country.name}</span>
        </span>
      ))}
    </>
  );
}

export function Status({ status }: { status: MapStatus }) {
  return (
    <span
      className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {MAP_STATUS_LABELS[status]}
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
  return (
    <span className="country-visit-marker">
      {(country.code === "XK" || country.code === "TW") && (
        <span
          className="country-set-badge"
          role="img"
          aria-label="Included in the 197-country set"
          title="197-country set: Kosovo and Taiwan"
        >
          <svg viewBox="0 0 24 28" aria-hidden="true">
            <path d="m12 1 3 2h3l1 3 3 2-1 3 2 3-2 3 1 3-3 2-1 3h-3l-3 2-3-2H6l-1-3-3-2 1-3-2-3 2-3-1-3 3-2 1-3h3Z" />
          </svg>
          <span>UN</span>
          <strong>197</strong>
        </span>
      )}
      {country.visit === "visited" ? (
        <CountryVisitedSummary country={country} />
      ) : (
        <VisitMarker visit={country.visit} />
      )}
    </span>
  );
}

function CountryVisitedSummary({ country }: { country: CountryRecord }) {
  const summary = countryVisitSummary(country);
  const count = summary.visits;
  const label = count == null ? "Visited" : count === 1 ? "Visit" : "Visits";
  const latest = latestCountryVisit(country);
  const year = latest?.slice(0, 4);
  return (
    <span className="country-visit-summary">
      <span
        className="country-last-visit"
        data-year={year}
        style={{
          color: year
            ? VISIT_YEAR_COLORS[Number(year) <= 2023 ? "2023" : year]
            : undefined,
        }}
        aria-hidden={!latest}
      >
        <span className="visually-hidden">Last visited </span>
        {latest ? formatShortVisitDate(latest) : ""}
      </span>
      <span className="visit-marker visit-marker-visited country-count-badge">
        <strong className="country-visit-count">{count ?? "—"}</strong>
        <span className="country-visit-label">{label}</span>
      </span>
      {summary.days != null && (
        <span className="country-row-duration">
          <strong>{summary.days}</strong> {summary.days === 1 ? "day" : "days"}
        </span>
      )}
    </span>
  );
}

function MilestoneCrown() {
  const id = useId();
  return (
    <svg
      className="country-order-shield country-order-crown"
      viewBox="0 0 40 44"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#fff4cc" />
          <stop offset="0.48" stopColor="#efd384" />
          <stop offset="1" stopColor="#dcb34d" />
        </linearGradient>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8e2" />
          <stop offset="1" stopColor="#f2dda1" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id}-gold)`}
        d="M4.1 13.2L11.7 20.1L18.7 6.4Q20 4.3 21.3 6.4L28.3 20.1L35.9 13.2L33.1 27.5L32.7 39.4Q20 42.6 7.3 39.4L6.9 27.5Z"
      />
      <path
        className="country-order-crown-band"
        fill={`url(#${id}-band)`}
        d="M6.5 24.7Q20 27.2 33.5 24.7L32.8 39.4Q20 42.7 7.2 39.4Z"
      />
      <path
        className="country-order-crown-highlight"
        d="M6.5 15.9L12.4 21.4L20 8.2L27.6 21.4L33.5 15.9"
      />
      <g className="country-order-crown-pearls">
        <circle cx="3.8" cy="12" r="1.65" />
        <circle cx="20" cy="4.6" r="1.9" />
        <circle cx="36.2" cy="12" r="1.65" />
      </g>
    </svg>
  );
}

export function CountryVisitOrderBadge({
  code,
  order,
}: {
  code: string;
  order: number | null;
}) {
  const label = order == null ? null : countryVisitOrderLabel(code, order);
  const milestone = order !== null && order > 0 && order % 10 === 0;
  return (
    <span className="country-row-order">
      {order != null && (
        <span
          className={`country-order-badge${milestone ? " country-order-badge--milestone" : ""}`}
          role="note"
          aria-label={`Visit order ${label}`}
          title={
            code === "XK"
              ? `Country visit order: #${label} · Included in the 197-country set`
              : `Country visit order: #${label}${milestone ? " · Milestone" : ""}`
          }
        >
          {milestone ? (
            <MilestoneCrown />
          ) : (
            <svg
              className="country-order-shield"
              viewBox="0 0 40 44"
              aria-hidden="true"
            >
              <path d="M6 3Q20 7 34 3Q35 8 38 11C34 20 38 28 34 34C30 39 24 40 20 43C16 40 10 39 6 34C2 28 6 20 2 11Q5 8 6 3Z" />
              <path
                className="country-order-shield-inset"
                d="M8 6Q20 9 32 6L35 12C32 21 35 28 32 32C29 36 23 38 20 40C17 38 11 36 8 32C5 28 8 21 5 12Z"
              />
            </svg>
          )}
          <span className="country-order-number">
            <span className="country-row-order-hash">#</span>
            {order}
            {code === "XK" && <sup className="country-order-asterisk">*</sup>}
          </span>
        </span>
      )}
    </span>
  );
}

export function CountryCityCount({ count }: { count: number }) {
  return (
    <span className="country-city-count" data-empty={count === 0}>
      <svg viewBox="0 0 48 44" aria-hidden="true">
        <path d="M22.3 3Q24 0 25.7 3L45 38Q46.5 41 43 41H5Q1.5 41 3 38Z" />
      </svg>
      <strong>{count}</strong> <span>{count === 1 ? "city" : "cities"}</span>
    </span>
  );
}

function CityVisitMarker({ city }: { city: City }) {
  if (city.visit !== "visited") return <VisitMarker visit={city.visit} />;
  const summary = cityVisitSummary(city.visits ?? []),
    date = summary.lastVisited ?? city.lastVisited;
  const count = summary.visits;
  const year = date?.slice(0, 4);
  return (
    <span className="city-visit-summary">
      <span
        className="city-last-visit"
        style={{
          color: year
            ? VISIT_YEAR_COLORS[Number(year) <= 2023 ? "2023" : year]
            : undefined,
        }}
        aria-hidden={!date}
      >
        <span className="visually-hidden">Last visited </span>
        {date ? formatShortVisitDate(date) : ""}
      </span>
      <span className="visit-marker visit-marker-visited city-count-badge">
        {count ? (
          <strong>{count}</strong>
        ) : (
          <CircleCheck size={18} aria-hidden="true" />
        )}
        <span>{count ? (count === 1 ? "Visit" : "Visits") : "Visited"}</span>
      </span>
      {summary.visits > 0 && (
        <span className="city-row-duration">
          <strong>{summary.days}</strong> {summary.days === 1 ? "day" : "days"}
        </span>
      )}
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
    <a
      href={cityProfileHref(city)}
      className="city-row"
      onClick={(event) => followProfileLink(event, () => onSelect(city.id))}
    >
      <CityVisitMarker city={city} />
      <span className="city-row-body">
        <span className="city-row-name">{city.name}</span>
        <span className="city-row-country">
          <EntryCountries entry={city} />
        </span>
        {!city.coordinates && (
          <span className="location-missing">Location missing</span>
        )}
      </span>
      <span className="city-row-metrics">
        <Status status={city.status} />
      </span>
      <ChevronRight className="row-chevron" size={14} aria-hidden="true" />
    </a>
  );
}
