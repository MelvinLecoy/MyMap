import { countryVisitSummary, type CountryRecord } from "../lib/countries";
import CollectionScoreboard, {
  type CollectionScoreSort,
} from "./CollectionScoreboard";

export default function CountryCollectionSummary({
  countries,
  visitedOnly,
  sort,
  onVisitedOnly,
  onSort,
}: {
  countries: CountryRecord[];
  visitedOnly: boolean;
  sort: CollectionScoreSort;
  onVisitedOnly: () => void;
  onSort: (sort: CollectionScoreSort) => void;
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
              : "Show visited countries only",
            onClick: onVisitedOnly,
          },
          {
            key: "visits",
            label: "Visits",
            value: countries.length && !knownVisits ? "—" : totals.visits,
            active: sort === "visits",
            title:
              sort === "visits"
                ? "Return to alphabetical order"
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
                ? "Return to alphabetical order"
                : "Sort by most days spent",
            onClick: () => onSort("days"),
          },
        ]}
      />
    </section>
  );
}
