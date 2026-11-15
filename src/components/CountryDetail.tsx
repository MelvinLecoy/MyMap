import { ArrowLeft, CalendarDays } from "lucide-react";
import { type CountryRecord, type CountryTrip } from "../lib/countries";
import { formatVisitDate, type City } from "../lib/types";
import { useCountryHeading } from "../lib/use-country-heading";
import { CityRow, Flag, CountryVisitOrderBadge } from "./CollectionItems";
import { visitDurationAnnotation } from "../lib/visit-duration";
import { isPlace } from "../lib/places";
import CountryReferenceOverview from "./CountryReferenceOverview";

function VisitDates({
  visit,
  compact = false,
}: {
  visit: CountryTrip;
  compact?: boolean;
}) {
  const duration = visitDurationAnnotation(
    visit.arrival,
    visit.departure,
    visit.daysSpent,
  );
  if (visit.arrival && visit.departure && visit.arrival !== visit.departure) {
    let arrival = formatVisitDate(visit.arrival);
    if (visit.arrival.length === 10 && visit.departure.length === 10) {
      if (visit.arrival.slice(0, 7) === visit.departure.slice(0, 7))
        arrival = String(Number(visit.arrival.slice(8)));
      else if (
        compact &&
        visit.arrival.slice(0, 4) === visit.departure.slice(0, 4)
      )
        arrival = arrival.replace(/ \d{4}$/, "");
    }
    return (
      <>
        {arrival} – {formatVisitDate(visit.departure)}
        {duration}
      </>
    );
  }
  if (visit.arrival)
    return (
      <>
        {formatVisitDate(visit.arrival)}
        {duration}
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
  onBack,
  onSelectCity,
  visitOrder = country.firstVisitOrder,
}: {
  country: CountryRecord;
  cities: City[];
  onBack: () => void;
  onSelectCity: (id: string) => void;
  visitOrder?: number | null;
}) {
  const headingRef = useCountryHeading(country.name, visitOrder);
  const placeCount = cities.filter(isPlace).length;
  const cityCount = cities.length - placeCount;
  const visitedCityCount = cities.filter(
    (city) => !isPlace(city) && city.visit === "visited",
  ).length;
  const visits = [...(country.visits ?? [])].sort(
    (a, b) => a.number - b.number,
  );
  const nameParts = country.name.split(/(\s+)/);
  return (
    <>
      <div className="detail-top country-detail-top">
        <button
          type="button"
          className="back-to-cities"
          aria-label="Back to countries"
          title="Back to countries"
          onClick={onBack}
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="country-detail" key={country.code}>
        <section
          className="detail-place-card country-place-card"
          aria-label={`${country.name} information`}
        >
          <div className="country-detail-heading" ref={headingRef}>
            <div className="country-detail-identity">
              <p className="detail-geography">
                {country.continent || "Country"}
              </p>
              <h1>
                {nameParts.map((part, index) =>
                  /^\s+$/.test(part) ? (
                    part
                  ) : index === nameParts.length - 1 ? (
                    <span key={index} className="country-name-ending">
                      <span className="country-name-word">{part}</span>
                      <Flag code={country.code} />
                    </span>
                  ) : (
                    <span key={index} className="country-name-word">
                      {part}
                    </span>
                  ),
                )}
              </h1>
            </div>
            <CountryVisitOrderBadge
              code={country.code}
              order={visitOrder ?? null}
            />
          </div>
          <CountryReferenceOverview code={country.code} />
        </section>

        <dl
          className="country-statistics country-travel-scoreboard"
          aria-label="Country visit statistics"
        >
          {(
            [
              [
                country.timesVisited == null && country.recordedVisits != null
                  ? "Recorded visits"
                  : "Visits",
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
              ["Cities visited", visitedCityCount, "cities"],
            ] as const
          ).map(([label, value, kind]) => (
            <div key={kind}>
              <dt>{label}</dt>
              <dd>
                {value == null ? (
                  <span
                    className="country-value-missing"
                    aria-label="Not recorded"
                  >
                    —
                  </span>
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
                            compact
                            visit={{
                              number: period.number,
                              arrival: period.arrival,
                              departure: period.departure,
                              daysSpent: period.daysSpent ?? null,
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
            <h2 id="country-cities-heading">
              {placeCount ? "Cities & places" : "Cities"}
            </h2>
            <span>
              {cityCount} {cityCount === 1 ? "city" : "cities"}
              {placeCount > 0 && (
                <>
                  {" "}
                  · {placeCount} {placeCount === 1 ? "place" : "places"}
                </>
              )}
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
