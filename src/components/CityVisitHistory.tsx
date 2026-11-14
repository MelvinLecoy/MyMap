import { CalendarDays } from "lucide-react";
import { cityVisitSummary, formatCityVisitRange } from "../lib/city-visits";
import type { CityVisit } from "../lib/types";
import { visitDurationAnnotation } from "../lib/visit-duration";

export default function CityVisitHistory({ visits }: { visits?: CityVisit[] }) {
  if (!visits?.length) return null;
  const summary = cityVisitSummary(visits);
  return (
    <section className="city-history" aria-labelledby="city-history-heading">
      <dl className="city-statistics" aria-label="City visit statistics">
        <div>
          <dt>Visits</dt>
          <dd>{summary.visits}</dd>
        </div>
        <div>
          <dt>Days spent</dt>
          <dd>{summary.days}</dd>
        </div>
      </dl>
      <h2 id="city-history-heading">
        <CalendarDays size={15} aria-hidden="true" />
        Visit history
      </h2>
      <ol className="city-visit-list">
        {[...visits]
          .sort((a, b) => b.number - a.number)
          .map((visit) => (
            <li key={visit.number}>
              <div className="city-visit-title">
                <strong>Visit {visit.number}</strong>
                <span>
                  {visit.daysSpent} {visit.daysSpent === 1 ? "day" : "days"}
                </span>
              </div>
              {(visit.periods?.length ?? 0) > 1 ? (
                <ul
                  className="city-stay-periods"
                  aria-label={`Stays for visit ${visit.number}`}
                >
                  {visit.periods!.map((period) => (
                    <li key={period.number}>
                      {formatCityVisitRange(period)}
                      {visitDurationAnnotation(
                        period.arrival,
                        period.departure,
                        period.daysSpent,
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {formatCityVisitRange(visit)}
                  {visitDurationAnnotation(
                    visit.arrival,
                    visit.departure,
                    visit.daysSpent,
                  )}
                </p>
              )}
            </li>
          ))}
      </ol>
    </section>
  );
}
