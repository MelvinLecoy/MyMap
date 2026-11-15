import type { TimelineCity, TimelineStay } from "./visit-timeline";

/** Presentation-only aliases for the country visit-caption solver. */
export const VISIT_CAPTION_SHORT_NAMES: Readonly<Record<string, string>> = {
  "gold-coast-australia": "GC",
  "rio-de-janeiro-brazil": "Rio",
  "buenos-aires-argentina": "BA",
  "andorra-la-vella-andorra": "Andorra lV",
  "kuala-lumpur-malaysia": "KL",
  "johor-bahru-malaysia": "JB",
  "ho-chi-minh-city-vietnam": "HCMC",
  "bandar-seri-begawan-brunei": "BSB",
  "san-pedro-sula-honduras": "SPS",
};
export function historyCityName(city: TimelineCity): string {
  return VISIT_CAPTION_SHORT_NAMES[city.id] ?? city.name;
}

export function visitSingleCity(
  stays: readonly Pick<TimelineStay, "exact" | "cities">[],
): TimelineCity | undefined {
  const city = stays[0]?.cities[0];
  return city &&
    stays.every(
      (stay) =>
        stay.exact && stay.cities.length === 1 && stay.cities[0].id === city.id,
    )
    ? city
    : undefined;
}

export interface CaptionPeriod {
  cities: string[];
  minimumWidth: number;
  compactWidth?: number;
  markerSize: number;
  point: boolean;
  startDateWidth: number;
  endDateWidth: number;
}
export interface CaptionBlock {
  width: number;
  lines: string[];
}
export interface CaptionTrack {
  indices: number[];
  gap: number;
}
export interface VisitCaptionLayout {
  blocks: CaptionBlock[];
  tracks: CaptionTrack[];
}
type Measure = (text: string) => number;

/** Contiguous city names stay together; choose balanced lines without dangling dots. */
export function cityCaptionOptions(
  names: readonly string[],
  measure: Measure,
  minimumWidth: number,
): CaptionBlock[] {
  if (!names.length) return [{ width: minimumWidth, lines: [] }];
  const n = names.length;
  const widths = Array.from({ length: n }, (_, start) =>
    Array.from({ length: n + 1 }, (_, end) =>
      end > start ? measure(names.slice(start, end).join(" · ")) : 0,
    ),
  );
  const options: CaptionBlock[] = [];
  for (let count = 1; count <= n; count++) {
    const memo = new Map<string, { width: number; lines: string[] }>();
    const partition = (
      start: number,
      remaining: number,
    ): { width: number; lines: string[] } => {
      const key = `${start}/${remaining}`;
      const cached = memo.get(key);
      if (cached) return cached;
      if (remaining === 1)
        return {
          width: widths[start][n],
          lines: [names.slice(start).join(" · ")],
        };
      let best = { width: Infinity, lines: [] as string[] };
      for (let end = start + 1; end <= n - remaining + 1; end++) {
        const rest = partition(end, remaining - 1);
        const width = Math.max(widths[start][end], rest.width);
        if (width < best.width)
          best = {
            width,
            lines: [names.slice(start, end).join(" · "), ...rest.lines],
          };
      }
      memo.set(key, best);
      return best;
    };
    const best = partition(0, count);
    options.push({
      width: Math.max(minimumWidth, Math.ceil(best.width) + 1),
      lines: best.lines,
    });
  }
  return options;
}

function minimumGap(
  periods: readonly CaptionPeriod[],
  blocks: readonly CaptionBlock[],
): number {
  let gap = 16;
  for (let i = 1; i < periods.length; i++) {
    const previous = periods[i - 1],
      next = periods[i];
    const rightInset = previous.point
      ? blocks[i - 1].width / 2
      : previous.markerSize / 2;
    const leftInset = next.point ? blocks[i].width / 2 : next.markerSize / 2;
    gap = Math.max(
      gap,
      Math.max(0, previous.endDateWidth / 2 - rightInset) +
        Math.max(0, next.startDateWidth / 2 - leftInset) +
        4,
    );
  }
  return gap;
}

/** Prefer one timeline track, then fewer caption lines, then narrower captions. */
export function layoutVisitCaptions(
  periods: readonly CaptionPeriod[],
  availableWidth: number,
  measure: Measure,
  preferredGap = 23,
): VisitCaptionLayout {
  if (!periods.length) return { blocks: [], tracks: [] };
  const available = Math.max(1, availableWidth);
  const options = periods.map((period) =>
    cityCaptionOptions(period.cities, measure, period.minimumWidth),
  );
  const compactOptions = periods.map((period) =>
    cityCaptionOptions(
      period.cities,
      measure,
      period.point
        ? period.minimumWidth
        : Math.min(
            period.minimumWidth,
            period.compactWidth ??
              Math.max(
                64,
                period.markerSize +
                  (period.startDateWidth + period.endDateWidth) / 2 +
                  4,
              ),
          ),
    ),
  );
  const solveTrack = (
    start: number,
    end: number,
    optionSet = options,
  ): { blocks: CaptionBlock[]; gap: number } | undefined => {
    const source = periods.slice(start, end),
      choices = optionSet.slice(start, end);
    const maxLines = Math.max(
      1,
      ...source.map((period) => period.cities.length),
    );
    for (let lines = 1; lines <= maxLines; lines++) {
      const blocks = choices.map((list) =>
        list
          .filter((block) => block.lines.length <= lines)
          .reduce((best, block) =>
            block.width < best.width ||
            (block.width === best.width &&
              block.lines.length < best.lines.length)
              ? block
              : best,
          ),
      );
      const total = blocks.reduce((sum, block) => sum + block.width, 0);
      const minGap = minimumGap(source, blocks);
      if (total + minGap * (blocks.length - 1) > available + 0.01) continue;
      const gap =
        blocks.length > 1
          ? Math.max(
              minGap,
              Math.min(preferredGap, (available - total) / (blocks.length - 1)),
            )
          : preferredGap;
      let remaining = available - total - gap * (blocks.length - 1);
      // Use spare width to remove caption lines, rather than stretching empty space.
      for (;;) {
        let upgrade:
          | { index: number; block: CaptionBlock; cost: number; score: number }
          | undefined;
        blocks.forEach((current, index) =>
          choices[index].forEach((block) => {
            const saved = current.lines.length - block.lines.length;
            const cost = block.width - current.width;
            if (saved <= 0 || cost > remaining + 0.01) return;
            const score = saved / Math.max(0.01, cost);
            if (!upgrade || score > upgrade.score)
              upgrade = { index, block, cost, score };
          }),
        );
        if (!upgrade) break;
        const selected = upgrade as {
          index: number;
          block: CaptionBlock;
          cost: number;
        };
        blocks[selected.index] = selected.block;
        remaining -= selected.cost;
      }
      return { blocks, gap };
    }
    return undefined;
  };
  const whole = solveTrack(0, periods.length);
  if (whole)
    return {
      blocks: whole.blocks,
      tracks: [{ indices: periods.map((_, index) => index), gap: whole.gap }],
    };
  const compact = solveTrack(0, periods.length, compactOptions);
  if (compact) {
    let spare = Math.max(
      0,
      available -
        compact.blocks.reduce((sum, block) => sum + block.width, 0) -
        compact.gap * (periods.length - 1),
    );
    compact.blocks.forEach((block, index) => {
      if (periods[index].point) return;
      const restore = Math.min(
        spare,
        Math.max(0, periods[index].minimumWidth - block.width),
      );
      block.width += restore;
      spare -= restore;
    });
    return {
      blocks: compact.blocks,
      tracks: [{ indices: periods.map((_, index) => index), gap: compact.gap }],
    };
  }

  type Plan = {
    blocks: CaptionBlock[];
    tracks: CaptionTrack[];
    maxLines: number;
    totalLines: number;
  };
  const memo = new Map<number, Plan>();
  const plan = (start: number): Plan => {
    if (start === periods.length)
      return { blocks: [], tracks: [], maxLines: 0, totalLines: 0 };
    const cached = memo.get(start);
    if (cached) return cached;
    let best: Plan | undefined;
    for (let end = start + 1; end <= periods.length; end++) {
      let track = solveTrack(start, end);
      if (!track && end === start + 1) {
        const block =
          options[start].find((option) => option.width <= available) ??
          options[start].at(-1)!;
        track = {
          blocks: [{ ...block, width: Math.min(available, block.width) }],
          gap: preferredGap,
        };
      }
      if (!track) continue;
      const rest = plan(end);
      const candidate: Plan = {
        blocks: [...track.blocks, ...rest.blocks],
        tracks: [
          {
            indices: Array.from(
              { length: end - start },
              (_, index) => start + index,
            ),
            gap: track.gap,
          },
          ...rest.tracks,
        ],
        maxLines: Math.max(
          ...track.blocks.map((block) => block.lines.length),
          rest.maxLines,
        ),
        totalLines: track.blocks.reduce(
          (sum, block) => sum + block.lines.length,
          rest.totalLines,
        ),
      };
      if (
        !best ||
        candidate.tracks.length < best.tracks.length ||
        (candidate.tracks.length === best.tracks.length &&
          (candidate.maxLines < best.maxLines ||
            (candidate.maxLines === best.maxLines &&
              candidate.totalLines < best.totalLines)))
      )
        best = candidate;
    }
    memo.set(start, best!);
    return best!;
  };
  const result = plan(0);
  return { blocks: result.blocks, tracks: result.tracks };
}
