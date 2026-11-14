import { useId } from "react";
import {
  MAP_STATUSES,
  MAP_STATUS_LABELS,
  type City,
  type MapStatus,
} from "../lib/types";
import { cityVisitSummary } from "../lib/city-visits";

export type CityScoreSort = "alphabetical" | "visits" | "days";

export default function CityCollectionSummary({
  cities,
  scope,
  status,
  onStatus,
  visitedOnly,
  sort,
  onVisitedOnly,
  onSort,
}: {
  cities: City[];
  scope: City[];
  status: string;
  onStatus: (status: MapStatus | "all") => void;
  visitedOnly: boolean;
  sort: CityScoreSort;
  onVisitedOnly: () => void;
  onSort: (sort: CityScoreSort) => void;
}) {
  const scoreboardId = useId();
  const visits = cities.flatMap((c) => c.visits ?? []),
    totals = cityVisitSummary(visits);
  const stats = [
    {
      key: "cities",
      label: "Cities visited",
      value: cities.filter((c) => c.visit === "visited").length,
      active: visitedOnly,
      title: visitedOnly ? "Show all cities" : "Show visited cities only",
      onClick: onVisitedOnly,
    },
    {
      key: "visits",
      label: "Visits",
      value: totals.visits,
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
      value: totals.days,
      active: sort === "days",
      title:
        sort === "days"
          ? "Return to alphabetical order"
          : "Sort by most days spent",
      onClick: () => onSort("days"),
    },
  ];
  const counts = MAP_STATUSES.map((value) => ({
    value,
    count: scope.filter((c) => c.status === value).length,
  }));
  const complete = counts[0].count;
  return (
    <section className="city-overview" aria-label="City collection statistics">
      <dl className="city-overview-totals">
        {stats.map((stat) => (
          <div key={stat.key} data-active={stat.active}>
            <dt id={`${scoreboardId}-${stat.key}-label`}>{stat.label}</dt>
            <dd>
              <button
                type="button"
                aria-labelledby={`${scoreboardId}-${stat.key}-label ${scoreboardId}-${stat.key}-value`}
                aria-pressed={stat.active}
                title={stat.title}
                onClick={stat.onClick}
              >
                <span id={`${scoreboardId}-${stat.key}-value`}>
                  {stat.value}
                </span>
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <div className="city-map-progress">
        <div className="city-map-progress-heading">
          <span>Map progress</span>
          <strong>
            {complete}
            <span> / {scope.length} complete</span>
          </strong>
        </div>
        <div
          className="city-map-progress-bar"
          role="img"
          aria-label={counts
            .map((c) => `${c.count} ${MAP_STATUS_LABELS[c.value]}`)
            .join(", ")}
        >
          {counts
            .filter((c) => c.count > 0)
            .map((c) => (
              <span
                key={c.value}
                className={`status-${c.value.toLowerCase().replaceAll(" ", "-")}`}
                style={{ flexGrow: c.count }}
              />
            ))}
        </div>
        <div
          className="city-map-filters"
          role="group"
          aria-label="Map progress filters"
        >
          {counts.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={status === c.value}
              className={`status-${c.value.toLowerCase().replaceAll(" ", "-")}`}
              onClick={() => onStatus(status === c.value ? "all" : c.value)}
            >
              <span>{MAP_STATUS_LABELS[c.value]}</span>
              <strong>{c.count}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
