import { memo, useMemo, type CSSProperties } from "react";
import {
  visitTimelineYears,
  type HistoryVisit,
  type TimelineStay,
  type HistoryCity,
} from "../lib/visit-timeline";

function StaySegment({ stay }: { stay: TimelineStay }) {
  if (!stay.exact)
    return (
      <div className="visit-period-fallback" role="listitem">
        {stay.range}
      </div>
    );
  const units = stay.days === 1 ? "day" : "days";
  const pointStay = stay.single || stay.days === 1;
  return (
    <div
      role="listitem"
      className={`visit-period${pointStay ? " visit-period--single" : ""}${stay.days === 1 ? " visit-period--one-day" : ""}${stay.exceptional && pointStay ? " visit-period--single-exception" : ""}${stay.cities.length ? " visit-period--with-cities" : ""}`}
      data-duration={stay.days ?? undefined}
      data-exception={stay.exceptional || undefined}
    >
      <div
        className="visit-period-plot"
        title={`${stay.range}${stay.days == null ? "" : ` · ${stay.days} ${units}`}${stay.exceptional ? " · Recorded duration differs from the calendar span" : ""}`}
      >
        {stay.cities.length > 0 && (
          <div className="visit-period-cities">
            {stay.cities.map((city) => city.name).join(" · ")}
          </div>
        )}
        <span className="visually-hidden">
          {stay.range}
          {stay.days == null
            ? ""
            : `, ${stay.days} ${units}${stay.exceptional ? ", recorded duration" : ""}`}
        </span>
        <div className="visit-period-axis" aria-hidden="true">
          {stay.precedingGap && (
            <span
              className="visit-period-gap"
              title="Separate stays; no connecting days added"
              aria-hidden="true"
            />
          )}
          <span className="visit-period-point" />
          {!pointStay && <span className="visit-period-line" />}
          {(!pointStay || stay.exceptional) && stay.days != null && (
            <span className="visit-period-duration">
              {stay.days}
              {stay.exceptional && <sup>*</sup>}
            </span>
          )}
          {!pointStay && (
            <>
              <span className="visit-period-line" />
              <span className="visit-period-point" />
            </>
          )}
        </div>
        <div
          className={`visit-period-dates${pointStay && !stay.single ? " visit-period-dates--point" : ""}`}
          aria-hidden="true"
        >
          <time dateTime={stay.arrival!}>{stay.startLabel}</time>
          {!stay.single && (
            <>
              {pointStay && <span>–</span>}
              <time dateTime={stay.departure!}>{stay.endLabel}</time>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(function VisitTimeline({
  visits,
  kind,
  cities,
}: {
  visits: readonly HistoryVisit[];
  kind: "country" | "city";
  cities?: readonly HistoryCity[];
}) {
  const years = useMemo(
    () => visitTimelineYears(visits, kind === "country" ? cities : undefined),
    [visits, kind, cities],
  );
  return (
    <ol
      className={`visit-timeline ${kind}-visit-list`}
      aria-label="Visits by year, newest first"
    >
      {years.map((group) => (
        <li
          className="visit-timeline-year"
          key={group.year ?? "unknown"}
          data-year={group.year ?? "unknown"}
          style={{ "--visit-year": group.color } as CSSProperties}
        >
          <div className="visit-year-marker">
            <span
              className="visit-year-circle"
              aria-label={group.year ?? "Year not recorded"}
            >
              {group.year ?? "—"}
            </span>
            {group.visits.length > 1 && (
              <span className="visit-year-count">
                {group.visits.length} visits
              </span>
            )}
          </div>
          <ol
            className="visit-year-card"
            aria-label={
              group.year ? `Visits in ${group.year}` : "Undated visits"
            }
          >
            {group.visits.map((visit) => (
              <li
                className="visit-timeline-entry"
                key={visit.number}
                data-visit-number={visit.number}
                aria-label={`Visit ${visit.number}`}
              >
                <div
                  className="visit-months"
                  role="list"
                  aria-label={`${kind === "country" ? "Actual stays" : "Stays"} for visit ${visit.number}`}
                >
                  {visit.months.map((row, index) => (
                    <div
                      className="visit-month-row"
                      key={`${row.key}-${index}`}
                    >
                      <div className="visit-month-label" aria-hidden="true">
                        {row.labels.map((label, i) => (
                          <span key={label}>
                            {i > 0 && <small>–</small>}
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="visit-month-periods">
                        {row.periods.map((stay) => (
                          <StaySegment key={stay.number} stay={stay} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <span
                  className="visit-total"
                  aria-label={
                    visit.days == null
                      ? "Duration not recorded"
                      : `${visit.days} ${visit.days === 1 ? "day" : "days"} in visit ${visit.number}`
                  }
                  title={
                    visit.days == null
                      ? "Duration not recorded"
                      : `${visit.days} ${visit.days === 1 ? "day" : "days"}`
                  }
                >
                  <span className="visit-total-clock" aria-hidden="true">
                    🕒
                  </span>
                  <strong>{visit.days ?? "—"}</strong>
                </span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
});
