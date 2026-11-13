import { MAP_STATUSES, type City, type MapStatus } from "../lib/types";
import { cityVisitSummary } from "../lib/city-visits";

export default function CityCollectionSummary({
  cities,
  scope,
  status,
  onStatus,
}: {
  cities: City[];
  scope: City[];
  status: string;
  onStatus: (status: MapStatus | "all") => void;
}) {
  const visits = cities.flatMap((c) => c.visits ?? []),
    totals = cityVisitSummary(visits);
  const counts = MAP_STATUSES.map((value) => ({
    value,
    count: scope.filter((c) => c.status === value).length,
  }));
  const complete = counts[0].count;
  return (
    <section className="city-overview" aria-label="City collection statistics">
      <dl className="city-overview-totals">
        <div>
          <dt>Cities visited</dt>
          <dd>{cities.filter((c) => c.visit === "visited").length}</dd>
        </div>
        <div>
          <dt>Visits</dt>
          <dd>{totals.visits}</dd>
        </div>
        <div>
          <dt>Days spent</dt>
          <dd>{totals.days}</dd>
        </div>
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
          aria-label={counts.map((c) => `${c.count} ${c.value}`).join(", ")}
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
              <span>{c.value}</span>
              <strong>{c.count}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
