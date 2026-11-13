import { bilingualPlaceName, providerTypography } from "./map-typography";
import { MAP_COLORS } from "./palette";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { City, CountryVisit } from "./types";
import type { FeatureCollection, Point } from "geojson";
export const MAP_CONFIG = {
  clusterRadius: 24,
  clusterMaxZoom: 4,
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
        paint: { "background-color": MAP_COLORS.water },
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
          /state|province|region|district|county|prefecture|city|town|place/.test(
            id,
          ) &&
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
          paint: { ...layer.paint, "background-color": MAP_COLORS.water },
        };
      if (layer.type === "fill")
        return {
          ...layer,
          paint: {
            ...layer.paint,
            "fill-color": /water/.test(layer.id)
              ? MAP_COLORS.water
              : MAP_COLORS.land,
          },
        };
      if (layer.type === "symbol") {
        const typography = providerTypography(layer);
        return {
          ...layer,
          minzoom: Math.max(layer.minzoom ?? 0, 5),
          layout: {
            ...layer.layout,
            ...typography.layout,
            ...(layer["source-layer"] === "place" ||
            /name:latin|name:nonlatin/.test(
              JSON.stringify(layer.layout?.["text-field"]),
            )
              ? { "text-field": bilingualPlaceName() }
              : {}),
          },
          paint: {
            ...layer.paint,
            "text-color": [
              "case",
              typography.isSubdivision,
              MAP_COLORS.subdivisionLabel,
              MAP_COLORS.cityLabel,
            ],
            "text-halo-color": MAP_COLORS.labelHalo,
            "text-halo-width": 1,
            "text-opacity": 1,
          },
        };
      }
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
                    ? MAP_COLORS.pinVisited
                    : c.visit === "not-visited"
                      ? MAP_COLORS.pinNotVisited
                      : MAP_COLORS.pinUnknown),
              },
            },
          ]
        : [],
    ),
  };
}
export function fillColors(countries: CountryVisit[]): string | unknown[] {
  if (!countries.length) return MAP_COLORS.land;
  return [
    "match",
    ["get", "code"],
    ...countries.flatMap((c) => [
      c.code,
      c.color || (c.visited ? MAP_COLORS.visitedCountry : MAP_COLORS.land),
    ]),
    MAP_COLORS.land,
  ];
}

export function countryFillOpacity(
  countries: CountryVisit[],
): ExpressionSpecification {
  return [
    "case",
    [
      "in",
      ["get", "code"],
      [
        "literal",
        countries
          .filter((country) => country.visited)
          .map((country) => country.code),
      ],
    ],
    1,
    0.95,
  ];
}
