import type {
  ExpressionSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { City } from "./types";
import { providerTypography } from "./map-typography";
import { convertFilter } from "@maplibre/maplibre-gl-style-spec";

const nameFields = [
  "name:latin",
  "name:en",
  "name_en",
  "name",
  "name:nonlatin",
];

// Basemap and collection coordinates can refer to different parts of a city.
// Match names locally so an unrelated city with the same name stays labelled.
export function providerLabelFilters(
  layers: SymbolLayerSpecification[],
  cities: City[],
): SymbolLayerSpecification[] {
  const names = new Map<string, [number, number][]>();
  for (const city of cities) {
    if (!city.coordinates) continue;
    const name = city.name.toLowerCase().trim();
    const aliases = new Set([
      name,
      name.normalize("NFD").replace(/\p{M}/gu, ""),
      name.replace(/^krong\s+/, "").replace(/\s+city$/, ""),
    ]);
    for (const alias of aliases) {
      const coordinates = names.get(alias) ?? [];
      coordinates.push(city.coordinates);
      names.set(alias, coordinates);
    }
  }
  if (!names.size) return layers;
  const matches: ExpressionSpecification = [
    "any",
    ...nameFields.map((field) => [
      "match",
      ["downcase", ["to-string", ["coalesce", ["get", field], ""]]],
      ...[...names].flatMap(([name, coordinates]) => [
        name,
        ["<=", ["distance", { type: "MultiPoint", coordinates }], 35000],
      ]),
      false,
    ]),
  ] as ExpressionSpecification;
  return layers.map((layer) => ({
    ...layer,
    filter: [
      "all",
      ...(layer.filter != null ? [convertFilter(layer.filter)] : []),
      ["any", providerTypography(layer).isSubdivision, ["!", matches]],
    ] as ExpressionSpecification,
  }));
}
