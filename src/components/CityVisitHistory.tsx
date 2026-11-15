import { CalendarDays } from "lucide-react";
import { cityVisitSummary } from "../lib/city-visits";
import type { CityVisit } from "../lib/types";
import VisitTimeline from "./VisitTimeline";

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
      <VisitTimeline visits={visits} kind="city" />
    </section>
  );
}
