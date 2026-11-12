import type {
  ExpressionSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";

export const LABEL_FONTS = {
  country: "Noto Serif Semibold",
  city: "Inter Semibold",
  subdivision: "Roboto Condensed Italic",
} as const;

// Compact map labels: size grows gently with zoom, rather than matching the
// deliberately enlarged lettering in the design mockup.
export const LABEL_SIZES = {
  country: [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    10.5,
    3,
    13,
    6,
    16,
    10,
    18,
  ] as ExpressionSpecification,
  city: [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    12,
    7,
    13,
    10,
    14,
  ] as ExpressionSpecification,
};
const subdivisionClasses = [
  "state",
  "province",
  "region",
  "district",
  "county",
  "prefecture",
  "oblast",
];
const subdivisionPattern =
  /state|province|region|district|county|prefecture|oblast/i;

export function providerTypography(layer: SymbolLayerSpecification): {
  isSubdivision: boolean | ExpressionSpecification;
  layout: NonNullable<SymbolLayerSpecification["layout"]>;
} {
  // Prefer explicit layer/class information over words in a place's name.
  const knownSubdivision = subdivisionPattern.test(layer.id);
  const isSubdivision: boolean | ExpressionSpecification = knownSubdivision || [
    "in",
    ["coalesce", ["get", "class"], ["get", "place"], ""],
    ["literal", subdivisionClasses],
  ];
  const choose = <const T extends string | number | ExpressionSpecification>(
    region: T,
    city: T,
  ): T | ExpressionSpecification =>
    knownSubdivision
      ? region
      : (["case", isSubdivision, region, city] as ExpressionSpecification);
  const size: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["zoom"],
    5,
    choose(11, 12),
    10,
    choose(12, 13.5),
  ] as ExpressionSpecification;
  return {
    isSubdivision,
    layout: {
      "text-font": knownSubdivision
        ? [LABEL_FONTS.subdivision]
        : [
            "case",
            isSubdivision,
            ["literal", [LABEL_FONTS.subdivision]],
            ["literal", [LABEL_FONTS.city]],
          ],
      "text-size": size,
      "text-transform": "none",
      "text-letter-spacing": choose(0.035, 0),
      "text-line-height": 1.15,
      "text-padding": knownSubdivision ? 8 : 4,
      "text-allow-overlap": false,
      "symbol-sort-key": choose(2, 0),
      "icon-image": choose("", "atlas-city-dot"),
      "icon-size": 1,
      "icon-padding": 1,
      "icon-allow-overlap": false,
      "text-anchor": choose("center", "left"),
      "text-offset": choose(
        ["literal", [0, 0]] as ExpressionSpecification,
        ["literal", [0.6, 0]] as ExpressionSpecification,
      ),
    },
  };
}

// Preserve the original scripts, but make the native second line subordinate
// and avoid printing an identical name twice.
export function bilingualPlaceName(): ExpressionSpecification {
  const primary: ExpressionSpecification = [
    "coalesce",
    ["get", "name:latin"],
    ["get", "name:en"],
    ["get", "name_en"],
    ["get", "name"],
    "",
  ];
  const native: ExpressionSpecification = [
    "coalesce",
    ["get", "name:nonlatin"],
    "",
  ];
  const hasNative: ExpressionSpecification = [
    "all",
    ["!=", native, ""],
    ["!=", native, primary],
  ];
  return [
    "format",
    primary,
    {},
    ["case", hasNative, "\n", ""],
    {},
    ["case", hasNative, native, ""],
    { "font-scale": 0.85 },
  ];
}
