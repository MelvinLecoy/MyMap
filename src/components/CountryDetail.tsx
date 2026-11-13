import { ArrowLeft, CalendarDays, StickyNote } from "lucide-react";
import type { CountryRecord, CountryTrip } from "../lib/countries";
import { formatVisitDate, type City } from "../lib/types";
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
}: {
  country: CountryRecord;
  cities: City[];
  countryCount: number;
  onBack: () => void;
  onSelectCity: (id: string) => void;
}) {
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
          <div className="country-detail-heading">
            <Flag code={country.code} />
            <h1>{country.name}</h1>
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
              ["Visit order", country.firstVisitOrder, "order"],
              ["Times visited", country.timesVisited, "visits"],
              ["Days spent", country.totalDaysSpent, "days"],
            ] as const
          ).map(([label, value, kind]) => (
            <div key={kind}>
              <dt>{label}</dt>
              <dd>
                {value == null ? (
                  <span className="country-value-missing">Not recorded</span>
                ) : (
                  <>
                    {kind === "order" ? "#" : ""}
                    {value}
                  </>
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
                  <p>
                    <VisitDates visit={visit} />
                  </p>
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
