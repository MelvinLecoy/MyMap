import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import {
  visitTimelineYears,
  type HistoryVisit,
  type TimelineStay,
  type HistoryCity,
  type TimelineMonth,
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
  const monthDates = stay.arrival?.slice(0, 7) !== stay.departure?.slice(0, 7);
  return (
    <div
      role="listitem"
      className={`visit-period${pointStay ? " visit-period--single" : ""}${stay.days === 1 ? " visit-period--one-day" : ""}${stay.exceptional && pointStay ? " visit-period--single-exception" : ""}${stay.cities.length ? " visit-period--with-cities" : ""}${monthDates ? " visit-period--month-dates" : ""}`}
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
        <div className="visit-period-dates" aria-hidden="true">
          {pointStay ? (
            <span className="visit-period-date-point">
              <time dateTime={stay.arrival!}>{stay.startLabel}</time>
              {!stay.single && (
                <>
                  –<time dateTime={stay.departure!}>{stay.endLabel}</time>
                </>
              )}
            </span>
          ) : (
            <>
              <time
                className="visit-period-date-start"
                dateTime={stay.arrival!}
              >
                {stay.startLabel}
              </time>
              <time
                className="visit-period-date-end"
                dateTime={stay.departure!}
              >
                {stay.endLabel}
              </time>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StayRow({ row }: { row: TimelineMonth }) {
  const container = useRef<HTMLDivElement>(null);
  const connections = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const element = container.current!;
    const svg = connections.current!;
    svg.replaceChildren();
    if (row.periods.length < 2) return;
    let active = true;
    const draw = () => {
      if (!active) return;
      const origin = element.getBoundingClientRect();
      const periods = [
        ...element.querySelectorAll<HTMLElement>(".visit-period"),
      ];
      const lines: SVGLineElement[] = [];
      for (let index = 1; index < periods.length; index++) {
        const previous = periods[index - 1].querySelectorAll(
          ".visit-period-point",
        );
        const next = periods[index].querySelector(".visit-period-point");
        if (!previous.length || !next) continue;
        const start = previous[previous.length - 1].getBoundingClientRect();
        const end = next.getBoundingClientRect();
        const startY = start.top + start.height / 2;
        const endY = end.top + end.height / 2;
        const length = end.left - start.right;
        // A wrapped stay starts a new visual line; never leave floating dashes.
        if (Math.abs(startY - endY) > 0.5 || length <= 3) continue;
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        line.classList.add("visit-period-gap");
        line.setAttribute("x1", String(start.right - origin.left));
        line.setAttribute("x2", String(end.left - origin.left));
        line.setAttribute("y1", String(startY - origin.top));
        line.setAttribute("y2", String(endY - origin.top));
        line.setAttribute("stroke-dasharray", `${(length - 3) / 4} 1`);
        line.dataset.from = String(index - 1);
        line.dataset.to = String(index);
        lines.push(line);
      }
      svg.replaceChildren(...lines);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    void document.fonts.ready.then(draw);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [row.periods]);
  return (
    <div className="visit-month-periods" ref={container}>
      <svg
        ref={connections}
        className="visit-period-connections"
        aria-hidden="true"
        focusable="false"
      />
      {row.periods.map((stay) => (
        <StaySegment key={stay.number} stay={stay} />
      ))}
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
  let nextRow = 1;
  return (
    <ol
      className={`visit-timeline ${kind}-visit-list`}
      aria-label="Visits by year, newest first"
      style={{
        gridTemplateRows: years
          .map((group) => `repeat(${group.visits.length}, auto)`)
          .join(" 12px "),
      }}
    >
      {years.map((group) => {
        const firstRow = nextRow;
        nextRow += group.visits.length + 1;
        return (
          <li
            className="visit-timeline-year"
            key={group.year ?? "unknown"}
            data-year={group.year ?? "unknown"}
            style={
              {
                "--visit-year": group.color,
                gridRow: `${firstRow} / span ${group.visits.length}`,
              } as CSSProperties
            }
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
                        <StayRow row={row} />
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
        );
      })}
    </ol>
  );
});
