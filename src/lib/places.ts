import type {
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";
import { fromCityRow, type CityRow } from "./cloud-data";
import { countryKey } from "./countries";
import type { City, Place, PlaceCountry } from "./types";
import { positionBounds } from "./country-camera";

export function isPlace(entry: City): entry is Place {
  return "kind" in entry && entry.kind === "place";
}

export function entryInCountry(entry: City, code: string) {
  return isPlace(entry)
    ? entry.countries.some((country) => country.code === code)
    : countryKey(entry) === code;
}

export function outlinePositions(outline: Polygon | MultiPolygon): Position[] {
  return outline.type === "Polygon"
    ? outline.coordinates.flat()
    : outline.coordinates.flat(2);
}

export function placeBounds(place: Place) {
  return place.outline ? positionBounds(outlinePositions(place.outline)) : null;
}

export function outlineContains(
  outline: Polygon | MultiPolygon,
  point: Position,
) {
  const inRing = (ring: Position[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i],
        [lastX, lastY] = ring[j];
      if (
        y > point[1] !== lastY > point[1] &&
        point[0] < ((lastX - x) * (point[1] - y)) / (lastY - y) + x
      )
        inside = !inside;
    }
    return inside;
  };
  const polygons =
    outline.type === "Polygon" ? [outline.coordinates] : outline.coordinates;
  return polygons.some(
    (polygon) => inRing(polygon[0]) && !polygon.slice(1).some(inRing),
  );
}

export interface PlaceRow extends Omit<CityRow, "country" | "country_code"> {
  countries: PlaceCountry[];
  outline: Polygon | MultiPolygon | null;
  outline_source: string;
}

function validOutline(value: unknown): value is Polygon | MultiPolygon {
  if (!value || typeof value !== "object") return false;
  const geometry = value as Polygon | MultiPolygon;
  if (
    !["Polygon", "MultiPolygon"].includes(geometry.type) ||
    !Array.isArray(geometry.coordinates) ||
    !geometry.coordinates.length
  )
    return false;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.every(
    (polygon) =>
      Array.isArray(polygon) &&
      polygon.length &&
      polygon.every(
        (ring) =>
          Array.isArray(ring) &&
          ring.length >= 4 &&
          ring.every(
            (point) =>
              Array.isArray(point) &&
              point.length >= 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]) &&
              Math.abs(point[0]) <= 180 &&
              Math.abs(point[1]) <= 90,
          ) &&
          ring[0][0] === ring.at(-1)![0] &&
          ring[0][1] === ring.at(-1)![1],
      ),
  );
}

export function fromPlaceRow(row: PlaceRow): Place {
  if (
    !Array.isArray(row.countries) ||
    !row.countries.length ||
    row.countries.some(
      (country) => !/^[A-Z]{2}$/.test(country.code) || !country.name,
    ) ||
    new Set(row.countries.map((country) => country.code)).size !==
      row.countries.length ||
    (row.outline !== null && !validOutline(row.outline))
  )
    throw new Error("The saved collection contains an invalid place.");
  const base = fromCityRow({
    ...row,
    country: row.countries.map((country) => country.name).join(" & "),
    country_code: null,
  });
  if (!base.coordinates)
    throw new Error("A place needs a representative pin position.");
  if (row.outline && !outlineContains(row.outline, base.coordinates))
    throw new Error("A place pin must be inside its outline.");
  return {
    ...base,
    kind: "place",
    countries: row.countries,
    outline: row.outline,
    outlineSource: row.outline_source,
    visits: [],
  };
}

export function placePinFeatures(places: Place[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      id: place.id,
      geometry: { type: "Point", coordinates: place.coordinates! },
      properties: { id: place.id, name: place.name, kind: "place" },
    })),
  };
}

export function placeOutlineFeatures(
  places: Place[],
): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: "FeatureCollection",
    features: places.flatMap((place) =>
      place.outline
        ? [
            {
              type: "Feature",
              id: place.id,
              geometry: place.outline,
              properties: { id: place.id, name: place.name },
            },
          ]
        : [],
    ),
  };
}
