import type { StyleSpecification } from "maplibre-gl";
import type { City, CountryVisit } from "./types";
import type { FeatureCollection, Point } from "geojson";
export const MAP_CONFIG = {
  clusterRadius: 48,
  clusterMaxZoom: 5,
  labelMinZoom: 4,
  maxZoom: 10,
  center: [25, 43] as [number, number],
  zoom: 1.8,
};
export function initialZoom(width: number, height: number) {
  return Math.min(
    MAP_CONFIG.zoom,
    Math.log2(Math.max(120, Math.min(width, height) * 0.73) / 175),
  );
}
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export function localStyle(): StyleSpecification {
  return {
    version: 8,
    name: "Elsewhere atlas",
    glyphs: new URL(
      asset("fonts/{fontstack}/{range}.pbf"),
      window.location.href,
    ).href
      .replaceAll("%7B", "{")
      .replaceAll("%7D", "}"),
    sources: {},
    layers: [
      {
        id: "ocean",
        type: "background",
        paint: { "background-color": "#183b4b" },
      },
    ],
    projection: { type: "globe" },
  };
}
export function simplifyProviderStyle(
  input: StyleSpecification,
): StyleSpecification {
  const layers = input.layers
    .filter((layer) => {
      const id = layer.id.toLowerCase();
      if (layer.type === "background") return true;
      if (layer.type === "symbol")
        return (
          /state|province|city|town|place/.test(id) &&
          !/country|continent/.test(id) &&
          !/poi|road|water|village|neighbour|suburb|hamlet|island/.test(id)
        );
      // Our own country fills and international/Admin 1 lines avoid duplicate boundaries.
      return (
        /water|land|earth/.test(id) &&
        !/waterway|water_name|water-name|landcover|landuse|park|building|road/.test(
          id,
        ) &&
        layer.type === "fill"
      );
    })
    .map((layer) => {
      if (layer.type === "background")
        return {
          ...layer,
          paint: { ...layer.paint, "background-color": "#183b4b" },
        };
      if (layer.type === "fill")
        return {
          ...layer,
          paint: {
            ...layer.paint,
            "fill-color": /water/.test(layer.id) ? "#183b4b" : "#405e5b",
          },
        };
      if (layer.type === "symbol")
        return {
          ...layer,
          minzoom: Math.max(layer.minzoom ?? 0, 5),
          layout: { ...layer.layout, "text-font": ["Open Sans Semibold"] },
          paint: {
            ...layer.paint,
            "text-color": "#d1dfda",
            "text-halo-color": "#294943",
            "text-halo-width": 1.2,
          },
        };
      return layer;
    });
  return {
    ...input,
    glyphs: localStyle().glyphs,
    layers,
  } as StyleSpecification;
}
export function cityFeatures(cities: City[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: cities.flatMap((c) =>
      c.coordinates
        ? [
            {
              type: "Feature" as const,
              id: c.id,
              geometry: { type: "Point" as const, coordinates: c.coordinates },
              properties: {
                id: c.id,
                name: c.name,
                visit: c.visit,
                color:
                  c.pinColor ??
                  (c.visit === "visited"
                    ? "#ffd08a"
                    : c.visit === "not-visited"
                      ? "#a5bbc6"
                      : "#152c3c"),
              },
            },
          ]
        : [],
    ),
  };
}
export function fillColors(countries: CountryVisit[]): string | unknown[] {
  if (!countries.length) return "#405e5b";
  return [
    "match",
    ["get", "code"],
    ...countries.flatMap((c) => [
      c.code,
      c.color || (c.visited ? "#4a9384" : "#405e5b"),
    ]),
    "#405e5b",
  ];
}
