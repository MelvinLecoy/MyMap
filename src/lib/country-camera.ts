import type { FeatureCollection, Position } from "geojson";

export type CountryBounds = [[number, number], [number, number]];

// Use the narrowest longitude interval so islands at the date line stay together.
export function positionBounds(positions: Position[]): CountryBounds | null {
  if (!positions.length) return null;
  const longitudes = [
    ...new Set(positions.map(([lng]) => ((lng % 360) + 360) % 360)),
  ].sort((a, b) => a - b);
  let largestGap = -1;
  let start = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next = (i + 1) % longitudes.length;
    const gap = longitudes[next] + (next === 0 ? 360 : 0) - longitudes[i];
    if (gap > largestGap) {
      largestGap = gap;
      start = next;
    }
  }
  const west =
    longitudes[start] > 180 ? longitudes[start] - 360 : longitudes[start];
  const latitudes = positions.map(([, lat]) =>
    Math.max(-85, Math.min(85, lat)),
  );
  return [
    [west, Math.min(...latitudes)],
    [west + 360 - largestGap, Math.max(...latitudes)],
  ];
}

export function countryBounds(
  collection: FeatureCollection,
  code: string,
): CountryBounds | null {
  const polygons: Position[][] = [];
  for (const feature of collection.features) {
    if (feature.properties?.code !== code) continue;
    const geometry = feature.geometry;
    if (geometry.type === "Polygon") polygons.push(geometry.coordinates[0]);
    else if (geometry.type === "MultiPolygon")
      for (const polygon of geometry.coordinates) polygons.push(polygon[0]);
  }
  const parts = polygons
    .map((points) => ({ points, bounds: positionBounds(points) }))
    .filter(
      (part): part is { points: Position[]; bounds: CountryBounds } =>
        part.bounds !== null,
    )
    .sort((a, b) => area(b.bounds) - area(a.bounds));
  const main = parts.shift();
  if (!main) return null;
  const positions = [...main.points];
  let bounds = main.bounds;
  const gap = Math.max(
    2,
    Math.min(
      12,
      Math.max(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]) * 0.15,
    ),
  );
  // Connect neighboring islands without framing distant overseas territories.
  let added = true;
  while (added) {
    added = false;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const shift =
        360 *
        Math.round(
          (bounds[0][0] +
            bounds[1][0] -
            part.bounds[0][0] -
            part.bounds[1][0]) /
            720,
        );
      if (
        part.bounds[1][0] + shift < bounds[0][0] - gap ||
        part.bounds[0][0] + shift > bounds[1][0] + gap ||
        part.bounds[1][1] < bounds[0][1] - gap ||
        part.bounds[0][1] > bounds[1][1] + gap
      )
        continue;
      positions.push(...part.points);
      bounds = positionBounds(positions)!;
      parts.splice(i, 1);
      added = true;
    }
  }
  return bounds;
}

function area(bounds: CountryBounds) {
  return (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]);
}
