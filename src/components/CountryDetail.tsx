import { useId } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  CircleDashed,
  Crown,
} from "lucide-react";
import type { CountryRecord, CountrySet, CountryTrip } from "../lib/countries";
import { formatVisitDate, VISIT_LABELS, type City } from "../lib/types";
import { useCountryHeading } from "../lib/use-country-heading";
import { CityRow, Flag } from "./CollectionItems";

function VisitDates({ visit }: { visit: CountryTrip }) {
  if (visit.arrival && visit.departure && visit.arrival !== visit.departure) {
    let arrival = formatVisitDate(visit.arrival);
    if (
      visit.arrival.length === 10 &&
      visit.departure.length === 10 &&
      visit.arrival.slice(0, 7) === visit.departure.slice(0, 7)
    ) {
      arrival = String(Number(visit.arrival.slice(8)));
    }
    return (
      <>
        {arrival} – {formatVisitDate(visit.departure)}
      </>
    );
  }
  if (visit.arrival)
    return (
      <>
        {formatVisitDate(visit.arrival)}
        {!visit.departure && " · Departure not recorded"}
      </>
    );
  if (visit.departure)
    return <>Arrival not recorded · {formatVisitDate(visit.departure)}</>;
  return <>Dates not recorded</>;
}

export default function CountryDetail({
  country,
  cities,
  countryCount,
  onBack,
  onSelectCity,
  visitOrder = country.firstVisitOrder,
  countrySet,
}: {
  country: CountryRecord;
  cities: City[];
  countryCount: number;
  onBack: () => void;
  onSelectCity: (id: string) => void;
  visitOrder?: number | null;
  countrySet?: CountrySet;
}) {
  const rankFillId = `country-rank-${useId().replace(/:/g, "")}`;
  const headingRef = useCountryHeading(country.name, visitOrder);
  const visits = [...(country.visits ?? [])].sort(
    (a, b) => a.number - b.number,
  );
  const visitLabel =
    country.visit === "unknown" ? "Not recorded" : VISIT_LABELS[country.visit];
  const VisitIcon =
    country.visit === "visited"
      ? CircleCheck
      : country.visit === "planned"
        ? CalendarDays
        : CircleDashed;
  return (
    <>
      <div className="detail-top country-detail-top">
        <button type="button" className="back-to-cities" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          All countries ({countryCount})
        </button>
      </div>
      <div className="country-detail" key={country.code}>
        <section
          className="detail-place-card country-place-card"
          aria-label={`${country.name} information`}
        >
          <div className="country-place-meta">
            <p className="detail-geography">{country.continent || "Country"}</p>
            <span
              className="country-status-badge"
              data-visit={country.visit}
              aria-label={`Visit status: ${visitLabel}`}
            >
              <VisitIcon size={13} strokeWidth={2} aria-hidden="true" />
              {visitLabel}
            </span>
          </div>
          <div className="country-detail-heading" ref={headingRef}>
            <Flag code={country.code} />
            <h1>
              {country.name.split(/(\s+)/).map((part, index) =>
                /^\s+$/.test(part) ? (
                  part
                ) : (
                  <span key={index} className="country-name-word">
                    {part}
                  </span>
                ),
              )}
            </h1>
            {visitOrder != null && (
              <span
                className="country-visit-rank"
                role="note"
                aria-label={`Visit order ${visitOrder}${countrySet ? ` in the ${countrySet}-country view` : ""}`}
                title={`Visit order${countrySet ? ` (${countrySet} countries)` : ""}`}
              >
                <svg
                  className="country-rank-frame"
                  viewBox="0 0 64 64"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={rankFillId} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#fffef8" />
                      <stop offset="100%" stopColor="#f5e6bf" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="32"
                    cy="32"
                    r="30.5"
                    fill={`url(#${rankFillId})`}
                  />
                  <path
                    d="M48 5A31 31 0 1 1 16 5"
                    fill="none"
                    stroke="#bea05c"
                    strokeWidth="1.15"
                    strokeLinecap="round"
                  />
                  <path
                    d="M45 9A26.5 26.5 0 1 1 19 9"
                    fill="none"
                    stroke="#dfc78d"
                    strokeWidth="0.85"
                    strokeLinecap="round"
                  />
                </svg>
                <Crown
                  className="country-rank-crown"
                  size={25}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span
                  className="country-rank-number"
                  data-digits={String(visitOrder).length}
                >
                  <span className="country-order-hash" aria-hidden="true">
                    #
                  </span>
                  <span className="country-rank-digits">{visitOrder}</span>
                </span>
              </span>
            )}
          </div>
        </section>

        <dl
          className="country-statistics"
          aria-label="Country visit statistics"
        >
          {(
            [
              [
                country.timesVisited == null && country.recordedVisits != null
                  ? "Recorded visits"
                  : "Times visited",
                country.timesVisited ?? country.recordedVisits,
                "visits",
              ],
              [
                country.totalDaysSpent == null &&
                country.recordedDaysSpent != null
                  ? "Recorded days"
                  : "Days spent",
                country.totalDaysSpent ?? country.recordedDaysSpent,
                "days",
              ],
            ] as const
          ).map(([label, value, kind]) => (
            <div key={kind}>
              <dt>{label}</dt>
              <dd>
                {value == null ? (
                  <span className="country-value-missing">Not recorded</span>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>

        <section
          className="country-history"
          aria-labelledby="country-history-heading"
        >
          <h2 id="country-history-heading">
            <CalendarDays size={15} aria-hidden="true" />
            Visit history
          </h2>
          {visits.length ? (
            <ol className="country-visit-list">
              {visits.map((visit) => (
                <li key={visit.number}>
                  <div className="country-visit-title">
                    <strong>Visit {visit.number}</strong>
                    <span>
                      {visit.daysSpent == null
                        ? "Duration not recorded"
                        : `${visit.daysSpent} ${visit.daysSpent === 1 ? "day" : "days"}`}
                    </span>
                  </div>
                  {visit.periods && visit.periods.length > 1 ? (
                    <ul
                      className="country-stay-periods"
                      aria-label={`Actual stays for visit ${visit.number}`}
                    >
                      {visit.periods.map((period) => (
                        <li key={period.number}>
                          <VisitDates
                            visit={{
                              number: period.number,
                              arrival: period.arrival,
                              departure: period.departure,
                              daysSpent: null,
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      <VisitDates visit={visit} />
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="country-history-empty">
              Visit dates and durations haven’t been added yet.
            </p>
          )}
        </section>

        <section
          className="country-cities"
          aria-labelledby="country-cities-heading"
        >
          <div className="country-cities-heading">
            <h2 id="country-cities-heading">Cities</h2>
            <span>
              {cities.length} {cities.length === 1 ? "city" : "cities"}
            </span>
          </div>
          <div
            className="country-city-list"
            aria-label={`Cities in ${country.name}`}
          >
            {cities.map((city) => (
              <CityRow key={city.id} city={city} onSelect={onSelectCity} />
            ))}
            {!cities.length && (
              <p className="country-history-empty">
                No cities added for this country yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
