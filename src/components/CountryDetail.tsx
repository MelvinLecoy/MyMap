import { ArrowLeft, CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { type CountryRecord } from "../lib/countries";
import { type City } from "../lib/types";
import { useCountryHeading } from "../lib/use-country-heading";
import { CityRow, Flag, CountryVisitOrderBadge } from "./CollectionItems";
import VisitTimeline from "./VisitTimeline";
import { isPlace } from "../lib/places";
import CountryReferenceOverview from "./CountryReferenceOverview";

// Review this case for future country/city imports; see AGENTS.md.
// These display preferences are independent of the number of stored cities.
const COUNTRIES_WITHOUT_CITY_LABELS = new Set([
  "SG",
  "MC",
  "VA",
  "SM",
  "LU",
  "LI",
  "MT",
]);

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
  const visits = country.visits ?? [];
  const historyCities = useMemo(
    () =>
      COUNTRIES_WITHOUT_CITY_LABELS.has(country.code)
        ? []
        : cities.filter((city) => !isPlace(city)),
    [cities, country.code],
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
          className={`detail-place-card country-place-card${country.visit === "visited" ? "" : " country-place-card--unvisited"}`}
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
            <VisitTimeline
              visits={visits}
              kind="country"
              cities={historyCities}
            />
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
