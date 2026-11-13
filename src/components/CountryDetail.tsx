import { ArrowLeft, CalendarDays, StickyNote } from "lucide-react";
import type { CountryRecord, CountrySet, CountryTrip } from "../lib/countries";
import { formatVisitDate, type City } from "../lib/types";
import { useCountryHeading } from "../lib/use-country-heading";
import { CityRow, Flag, VisitMarker } from "./CollectionItems";

function VisitDates({ visit }: { visit: CountryTrip }) {
  if (visit.arrival && visit.departure && visit.arrival !== visit.departure) {
    return (
      <>
        {formatVisitDate(visit.arrival)} – {formatVisitDate(visit.departure)}
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
  const headingRef = useCountryHeading(country.name, visitOrder);
  const visits = [...(country.visits ?? [])].sort(
    (a, b) => a.number - b.number,
  );
  return (
    <>
      <div className="detail-top country-detail-top">
        <button type="button" className="back-to-cities" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          All countries ({countryCount})
        </button>
      </div>
      <div className="country-detail" key={country.code}>
        <section
          className="detail-place-card country-place-card"
          aria-label={`${country.name} information`}
        >
          <p className="detail-geography">{country.continent || "Country"}</p>
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
                <span className="country-order-hash" aria-hidden="true">
                  #
                </span>
                {visitOrder}
              </span>
            )}
          </div>
          <div className="country-detail-visit">
            <span>Visit status</span>
            {country.visit === "unknown" ? (
              <span className="country-value-missing">Not recorded</span>
            ) : (
              <VisitMarker visit={country.visit} inline />
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
        {country.recordedVisits != null && !country.visitHistoryComplete && (
          <p className="country-history-scope">
            These totals cover recorded trips; earlier visits may be missing.
            Return stays less than 14 days apart count as one visit. Days spent
            exclude gaps.
          </p>
        )}

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
                  <p>
                    <VisitDates visit={visit} />
                  </p>
                  {visit.periods && visit.periods.length > 1 && (
                    <div
                      className="country-stay-periods"
                      aria-label={`Actual stays for visit ${visit.number}`}
                    >
                      <p>Actual stays</p>
                      <ul>
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
                    </div>
                  )}
                  {visit.notes && (
                    <p className="country-visit-note">{visit.notes}</p>
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

        {country.notes && (
          <section className="notes-section">
            <h2>
              <StickyNote size={14} aria-hidden="true" />
              Notes
            </h2>
            <p>{country.notes}</p>
          </section>
        )}

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
