import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  visitTimelineYears,
  type HistoryVisit,
  type TimelineStay,
  type HistoryCity,
  type TimelineMonth,
} from "../lib/visit-timeline";
import {
  stayMarkers,
  type StayMarker,
  type VisitMarkerContext,
} from "../lib/visit-markers";
import {
  historyCityName,
  layoutVisitCaptions,
  visitSingleCity,
  type CaptionBlock,
  type VisitCaptionLayout,
} from "../lib/visit-caption-layout";

function Endpoint({ marker, oneDay }: { marker: StayMarker; oneDay: boolean }) {
  return (
    <span
      className={`visit-period-point visit-period-point--${marker}`}
      data-marker={marker}
    >
      {(oneDay || marker === "diamond") && (
        <span className="visit-period-point-label">
          {marker === "diamond" ? (
            <>
              <span className="visit-period-point-number">1</span>
              <sup>*</sup>
            </>
          ) : (
            "1"
          )}
        </span>
      )}
    </span>
  );
}

function StaySegment({
  stay,
  context,
  hideCities = false,
  adaptive = false,
  caption,
}: {
  stay: TimelineStay;
  context: VisitMarkerContext;
  hideCities?: boolean;
  adaptive?: boolean;
  caption?: CaptionBlock;
}) {
  if (!stay.exact)
    return (
      <div className="visit-period-fallback" role="listitem">
        {stay.range}
      </div>
    );
  const units = stay.days === 1 ? "day" : "days";
  const markers = stayMarkers(stay, context);
  const pointStay = markers.length === 1;
  const diamond = markers[0] === "diamond";
  const oneDay = pointStay && !stay.exceptional && stay.days === 1;
  const monthDates = stay.monthDates;
  const sharedPointMonth =
    pointStay &&
    !stay.single &&
    stay.arrival!.slice(0, 7) === stay.departure!.slice(0, 7);
  const pointStartLabel = sharedPointMonth
    ? String(Number(stay.arrival!.slice(8)))
    : stay.startLabel;
  const pointEndLabel = sharedPointMonth
    ? stay.endLabel + stay.startLabel.replace(/^\d+/, "")
    : stay.endLabel;
  const showCities = !hideCities && stay.cities.length > 0;
  const multipleCities = stay.cities.length > 1;
  const cityLines = caption?.lines ?? [stay.cities.map(historyCityName)];
  const width =
    caption?.width ?? (pointStay ? (diamond ? 18 : 9) : monthDates ? 84 : 76);
  return (
    <div
      role="listitem"
      className={`visit-period${pointStay ? " visit-period--single" : ""}${diamond ? " visit-period--diamond" : ""}${stay.exceptional && pointStay && !diamond ? " visit-period--single-exception" : ""}${showCities ? " visit-period--with-cities" : ""}${monthDates ? " visit-period--month-dates" : ""}`}
      style={
        adaptive
          ? ({ "--visit-caption-width": `${width}px` } as CSSProperties)
          : undefined
      }
      data-duration={stay.days ?? undefined}
      data-exception={stay.exceptional || undefined}
    >
      <div
        className="visit-period-plot"
        title={`${stay.range}${stay.days == null ? "" : ` · ${stay.days} ${units}`}${stay.exceptional ? " · Recorded duration differs from the calendar span" : ""}`}
      >
        {showCities && (
          <div
            className={`visit-period-cities${multipleCities ? " visit-period-cities--multiple" : ""}`}
            title={stay.cities.map((city) => city.name).join(", ")}
          >
            {cityLines.map((line, index) => (
              <span className="visit-period-city-line" key={index}>
                {multipleCities
                  ? line.map((name) => (
                      <span className="visit-city-chip" key={name}>
                        {name}
                      </span>
                    ))
                  : line[0]}
              </span>
            ))}
          </div>
        )}
        <span className="visually-hidden">
          {stay.range}
          {stay.days == null
            ? ""
            : `, ${stay.days} ${units}${stay.exceptional ? ", recorded duration" : ""}`}
        </span>
        <div className="visit-period-axis" aria-hidden="true">
          <Endpoint marker={markers[0]} oneDay={oneDay} />
          {!pointStay && <span className="visit-period-line" />}
          {(!pointStay || (stay.exceptional && !diamond)) &&
            stay.days != null && (
              <span className="visit-period-duration">
                {stay.days}
                {stay.exceptional && <sup>*</sup>}
              </span>
            )}
          {!pointStay && (
            <>
              <span className="visit-period-line" />
              <Endpoint marker={markers[1]} oneDay={false} />
            </>
          )}
        </div>
        <div className="visit-period-dates" aria-hidden="true">
          {pointStay ? (
            <span className="visit-period-date-point">
              <time dateTime={stay.arrival!}>{pointStartLabel}</time>
              {!stay.single && (
                <>
                  –<time dateTime={stay.departure!}>{pointEndLabel}</time>
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

function StayRow({
  row,
  context,
  hideCities = false,
}: {
  row: TimelineMonth;
  context: VisitMarkerContext;
  hideCities?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const connections = useRef<SVGSVGElement>(null);
  const adaptive =
    context.kind === "country" &&
    row.periods.every((stay) => stay.exact) &&
    row.periods.some((stay) => stay.cities.length);
  const version = `${context.kind}/${context.countryCode}/${hideCities}`;
  const [sizing, setSizing] = useState<{
    source: TimelineStay[];
    version: string;
    value: VisitCaptionLayout;
  }>();
  const layout =
    adaptive && sizing?.source === row.periods && sizing.version === version
      ? sizing.value
      : undefined;
  useLayoutEffect(() => {
    if (!adaptive) return;
    const element = container.current!;
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return;
    let active = true;
    let previousKey = "";
    const measure = (force = false) => {
      if (!active) return;
      const caption =
        element.querySelector(".visit-period-cities") ??
        element.parentElement!.querySelector(".visit-month-city");
      if (!caption) return;
      const style = getComputedStyle(element);
      const font = getComputedStyle(caption).font;
      const width =
        element.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const key = `${width}/${font}`;
      if (!force && key === previousKey) return;
      previousKey = key;
      const dateElement = element.querySelector(".visit-period-dates")!;
      const dateFont = getComputedStyle(dateElement).font;
      canvas.font = dateFont;
      const dateWidth = (text: string) => canvas.measureText(text).width;
      const rendered = [...element.querySelectorAll(".visit-period")];
      const periods = row.periods.map((stay, index) => {
        const markers = stayMarkers(stay, context);
        const point = markers.length === 1;
        const sameMonth =
          point &&
          !stay.single &&
          stay.arrival!.slice(0, 7) === stay.departure!.slice(0, 7);
        const first = sameMonth
          ? String(Number(stay.arrival!.slice(8)))
          : stay.startLabel;
        const last = sameMonth
          ? stay.endLabel + stay.startLabel.replace(/^\d+/, "")
          : stay.endLabel;
        const label = stay.single ? first : `${first}–${last}`;
        const duration =
          rendered[index]
            ?.querySelector(".visit-period-duration")
            ?.getBoundingClientRect().width ?? 0;
        const startDateWidth = dateWidth(point ? label : stay.startLabel);
        const endDateWidth = dateWidth(point ? label : stay.endLabel);
        return {
          cities: hideCities ? [] : stay.cities.map(historyCityName),
          minimumWidth: point
            ? markers[0] === "diamond"
              ? 18
              : duration
                ? 9 + 2 * (3 + duration)
                : 9
            : stay.monthDates
              ? 84
              : 76,
          markerSize: markers[0] === "diamond" ? 18 : 9,
          compactWidth: point
            ? undefined
            : Math.max(
                64,
                36 + duration,
                13 + (startDateWidth + endDateWidth) / 2,
              ),
          point,
          startDateWidth,
          endDateWidth,
        };
      });
      canvas.font = font;
      const next = layoutVisitCaptions(
        periods,
        width,
        (text) => canvas.measureText(text).width,
        parseFloat(style.getPropertyValue("--visit-gap-width")) || 23,
      );
      setSizing((previous) =>
        previous?.source === row.periods &&
        previous.version === version &&
        JSON.stringify(previous.value) === JSON.stringify(next)
          ? previous
          : { source: row.periods, version, value: next },
      );
    };
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    measure();
    void document.fonts.ready.then(() => measure(true));
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [
    adaptive,
    row.periods,
    context.kind,
    context.countryCode,
    hideCities,
    version,
  ]);
  useLayoutEffect(() => {
    const element = container.current!;
    const svg = connections.current!;
    svg.replaceChildren();
    if (row.periods.length < 2 && context.kind !== "country") return;
    let active = true;
    const draw = () => {
      if (!active) return;
      if (context.kind === "country") {
        const monthRow = element.parentElement!;
        const heading = monthRow.querySelector<HTMLElement>(
          ".visit-month-heading",
        )!;
        const month = heading.querySelector<HTMLElement>(".visit-month-label")!;
        const city = heading.querySelector<HTMLElement>(".visit-month-city");
        const first = element
          .querySelector(".visit-period-point")
          ?.getBoundingClientRect();
        if (first) {
          const padding = parseFloat(getComputedStyle(element).paddingTop) || 0;
          const axis =
            first.top +
            first.height / 2 -
            element.getBoundingClientRect().top -
            padding;
          const prefix = city
            ? city.getBoundingClientRect().height +
              (parseFloat(getComputedStyle(city).marginBottom) || 0)
            : 0;
          const offset =
            axis - prefix - month.getBoundingClientRect().height / 2;
          for (const [name, value] of [
            ["--visit-heading-top", Math.max(0, offset)],
            ["--visit-caption-top", Math.max(0, -offset)],
          ] as const) {
            const next = `${value}px`;
            if (monthRow.style.getPropertyValue(name) !== next)
              monthRow.style.setProperty(name, next);
          }
          const date = element
            .querySelector(".visit-period-date-point,.visit-period-date-start")
            ?.getBoundingClientRect();
          const previousClearance =
            parseFloat(
              monthRow.style.getPropertyValue("--visit-date-clearance"),
            ) || 0;
          let clearance = 0;
          if (date) {
            for (const label of month.children) {
              const box = label.getBoundingClientRect();
              if (date.left < box.right && date.right > box.left)
                clearance = Math.max(
                  clearance,
                  box.bottom + 3 - date.top + previousClearance,
                );
            }
          }
          const nextClearance = `${Math.max(0, clearance)}px`;
          if (
            monthRow.style.getPropertyValue("--visit-date-clearance") !==
            nextClearance
          )
            monthRow.style.setProperty("--visit-date-clearance", nextClearance);
          const entry = monthRow.closest<HTMLElement>(".visit-timeline-entry")!;
          const total = entry.querySelector<HTMLElement>(".visit-total")!;
          const points = [
            ...element.querySelectorAll(".visit-period-point"),
          ].map((point) => point.getBoundingClientRect());
          const axisY = points[0].top + points[0].height / 2;
          const oneTrack = points.every(
            (point) => Math.abs(point.top + point.height / 2 - axisY) < 0.5,
          );
          entry.dataset.timelineAxis = oneTrack ? "single" : "multiple";
          if (oneTrack) {
            const top =
              axisY -
              entry.getBoundingClientRect().top -
              (parseFloat(getComputedStyle(entry).paddingTop) || 0) -
              total.getBoundingClientRect().height / 2;
            const next = `${top}px`;
            if (entry.style.getPropertyValue("--visit-total-top") !== next)
              entry.style.setProperty("--visit-total-top", next);
          }
        }
      }
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
        const dash = 5,
          gap = 1;
        const count = Math.ceil((length + gap) / (dash + gap));
        // Keep the default dash rhythm and join both marker edges inside a dash.
        const offset = (count * (dash + gap) - gap - length) / 2;
        line.setAttribute("stroke-dasharray", `${dash} ${gap}`);
        line.setAttribute("stroke-dashoffset", String(offset));
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
  }, [row.periods, context.kind, context.countryCode, layout, adaptive]);
  return (
    <div
      className={`visit-month-periods${row.periods.length > 1 && row.periods.some((stay) => stay.monthDates) ? " visit-month-periods--shared-months" : ""}${row.periods.length > 1 && row.periods.some((stay) => stay.yearDates) ? " visit-month-periods--year-dates" : ""}${adaptive ? " visit-month-periods--adaptive" : ""}${adaptive && row.periods.some((stay) => stay.monthDates) ? " visit-month-periods--adaptive-months" : ""}`}
      ref={container}
    >
      <svg
        ref={connections}
        className="visit-period-connections"
        aria-hidden="true"
        focusable="false"
      />
      {adaptive
        ? (
            layout?.tracks ?? [
              { indices: row.periods.map((_, index) => index), gap: 23 },
            ]
          ).map((track, index) => (
            <div
              className="visit-period-track"
              key={index}
              style={
                { "--visit-caption-gap": `${track.gap}px` } as CSSProperties
              }
            >
              {track.indices.map((index) => (
                <StaySegment
                  key={row.periods[index].number}
                  stay={row.periods[index]}
                  context={context}
                  hideCities={hideCities}
                  adaptive
                  caption={layout?.blocks[index]}
                />
              ))}
            </div>
          ))
        : row.periods.map((stay) => (
            <StaySegment key={stay.number} stay={stay} context={context} />
          ))}
    </div>
  );
}

function VisitMonthRow({
  row,
  context,
}: {
  row: TimelineMonth;
  context: VisitMarkerContext;
}) {
  const city =
    context.kind === "country" ? visitSingleCity(row.periods) : undefined;
  return (
    <div
      className={`visit-month-row${city ? " visit-month-row--visit-city" : ""}`}
    >
      <div
        className={`visit-month-heading${city ? " visit-month-heading--city" : ""}`}
      >
        {city && (
          <div className="visit-month-city" title={city.name}>
            {historyCityName(city)}
          </div>
        )}
        <div className="visit-month-label" aria-hidden="true">
          {row.labels.map((label, index) => (
            <span key={label}>
              {index > 0 && <small>–</small>}
              {label}
            </span>
          ))}
        </div>
      </div>
      <StayRow row={row} context={context} hideCities={Boolean(city)} />
    </div>
  );
}

export default memo(function VisitTimeline({
  visits,
  kind,
  cities,
  countryCode,
}: {
  visits: readonly HistoryVisit[];
  kind: "country" | "city";
  cities?: readonly HistoryCity[];
  countryCode?: string | null;
}) {
  const years = useMemo(
    () => visitTimelineYears(visits, kind === "country" ? cities : undefined),
    [visits, kind, cities],
  );
  const timeline = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    if (kind !== "country") return;
    const element = timeline.current!;
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return;
    let active = true;
    const align = () => {
      if (!active) return;
      let width = 32;
      for (const city of element.querySelectorAll<HTMLElement>(
        ".visit-month-city",
      )) {
        canvas.font = getComputedStyle(city).font;
        width = Math.max(
          width,
          Math.min(
            64,
            Math.ceil(
              Math.max(
                ...String(city.textContent ?? "")
                  .split(/\s+/)
                  .map((word) => canvas.measureText(word).width),
              ),
            ) + 1,
          ),
        );
      }
      element.style.setProperty("--visit-city-column", `${width}px`);
    };
    align();
    void document.fonts.ready.then(align);
    return () => {
      active = false;
    };
  }, [years, kind]);
  let nextRow = 1;
  return (
    <ol
      className={`visit-timeline ${kind}-visit-list`}
      ref={timeline}
      aria-label="Visits by year, newest first"
      style={
        {
          gridTemplateRows: years
            .map((group) => `repeat(${group.visits.length}, auto)`)
            .join(" 12px "),
        } as CSSProperties
      }
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
                      <VisitMonthRow
                        key={`${row.key}-${index}`}
                        row={row}
                        context={{ kind, countryCode }}
                      />
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
