import {
  countryVisitSummary,
  type CountryRecord,
  type CountrySet,
} from "../lib/countries";
import FilterDropdown from "./FilterDropdown";
import CollectionScoreboard, {
  type CollectionScoreSort,
} from "./CollectionScoreboard";

export type CountryScoreSort = CollectionScoreSort | "visit-order";

export default function CountryCollectionSummary({
  countries,
  visitedOnly,
  sort,
  onVisitedOnly,
  onSort,
  countrySet,
  onCountrySet,
}: {
  countries: CountryRecord[];
  visitedOnly: boolean;
  sort: CountryScoreSort;
  onVisitedOnly: () => void;
  onSort: (sort: CountryScoreSort) => void;
  countrySet?: CountrySet;
  onCountrySet?: (set: CountrySet) => void;
}) {
  const totals = countries.reduce(
    (sum, country) => {
      const current = countryVisitSummary(country);
      return {
        visits: sum.visits + (current.visits ?? 0),
        days: sum.days + (current.days ?? 0),
      };
    },
    { visits: 0, days: 0 },
  );
  const knownVisits = countries.some(
    (country) =>
      country.visit !== "visited" ||
      countryVisitSummary(country).visits != null,
  );
  const knownDays = countries.some(
    (country) =>
      country.visit !== "visited" || countryVisitSummary(country).days != null,
  );
  return (
    <section
      className="city-overview country-overview"
      aria-label="Country collection statistics"
    >
      <CollectionScoreboard
        className="country-overview-totals"
        stats={[
          {
            key: "countries",
            label: "Countries visited",
            value: countries.filter((country) => country.visit === "visited")
              .length,
            active: visitedOnly,
            title: visitedOnly
              ? "Show all countries"
              : "Show visited countries",
            onClick: onVisitedOnly,
            cornerControl: (
              <button
                type="button"
                className="country-alphabetical-toggle"
                aria-label="Sort countries alphabetically"
                aria-pressed={sort === "alphabetical"}
                title={
                  sort === "alphabetical"
                    ? "Return to visit number order"
                    : "Sort alphabetically"
                }
                onClick={() => onSort("alphabetical")}
              >
                A
              </button>
            ),
            valueControl:
              countrySet && onCountrySet ? (
                <div className="country-scoreboard-scope">
                  <FilterDropdown
                    label="Country scoreboard scope"
                    value={String(countrySet)}
                    onChange={(value) =>
                      onCountrySet(value === "197" ? 197 : 195)
                    }
                    valueContent={
                      <>
                        <span aria-hidden="true">/</span>
                        {countrySet}
                      </>
                    }
                    options={[
                      { value: "195", label: "195" },
                      { value: "197", label: "197 (🇽🇰🇹🇼)" },
                    ]}
                  />
                </div>
              ) : undefined,
          },
          {
            key: "visits",
            label: "Visits",
            value: countries.length && !knownVisits ? "—" : totals.visits,
            active: sort === "visits",
            title:
              sort === "visits"
                ? "Return to visit number order"
                : "Sort by most visits",
            onClick: () => onSort("visits"),
          },
          {
            key: "days",
            label: "Days spent",
            value: countries.length && !knownDays ? "—" : totals.days,
            active: sort === "days",
            title:
              sort === "days"
                ? "Return to visit number order"
                : "Sort by most days spent",
            onClick: () => onSort("days"),
          },
        ]}
      />
    </section>
  );
}
