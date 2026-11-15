/** Owner's COUNTRY_METRIC_INDEX.md, model V1. Offline data preparation only. */
export const COUNTRY_INDEX_MODEL = {
  version: "V1",
  weight: 0.58,
  magnitudeExponent: 0.26,
  rankExponent: 1.75,
} as const;

export function metricIndex(
  value: number,
  maximum: number,
  rank: number,
  count: number,
) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(maximum) ||
    maximum <= 0 ||
    !Number.isInteger(rank) ||
    !Number.isInteger(count) ||
    count < 2 ||
    rank < 1 ||
    rank > count ||
    value > maximum
  )
    return null;
  const magnitude = (value / maximum) ** COUNTRY_INDEX_MODEL.magnitudeExponent;
  const distribution =
    ((count - rank) / (count - 1)) ** COUNTRY_INDEX_MODEL.rankExponent;
  return Math.max(
    0,
    Math.min(
      100,
      100 *
        (COUNTRY_INDEX_MODEL.weight * magnitude +
          (1 - COUNTRY_INDEX_MODEL.weight) * distribution),
    ),
  );
}

export function indexedPool(values: { code: string; value: number | null }[]) {
  const valid = values
    .filter(
      (item): item is { code: string; value: number } =>
        item.value !== null && Number.isFinite(item.value) && item.value >= 0,
    )
    .sort((a, b) => b.value - a.value);
  const maximum = valid[0]?.value ?? 0;
  const ranks = new Map<number, number>();
  const scores = new Map<
    string,
    { value: number; rank: number; index: number | null }
  >();
  valid.forEach((item, position) => {
    if (!ranks.has(item.value)) ranks.set(item.value, position + 1);
    const rank = ranks.get(item.value)!;
    scores.set(item.code, {
      ...item,
      rank,
      index: metricIndex(item.value, maximum, rank, valid.length),
    });
  });
  return { count: valid.length, maximum, scores };
}

export function median(values: (number | null)[]) {
  const valid = values
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
    .sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2
    ? valid[middle]
    : (valid[middle - 1] + valid[middle]) / 2;
}

export function gdpPerCapita(
  gdpBillions: number | null,
  population: number | null,
) {
  return gdpBillions !== null &&
    population !== null &&
    Number.isFinite(gdpBillions) &&
    gdpBillions >= 0 &&
    Number.isFinite(population) &&
    population > 0
    ? (gdpBillions * 1e9) / population
    : null;
}
