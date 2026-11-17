import type { FillLayerSpecification } from "maplibre-gl";
import { COUNTRY_STRIPE_COLORS } from "./palette";
import type { CountryVisit } from "./types";

export function countryVisitYear(date?: string | null) {
  if (!date || !/^\d{4}(?:-|$)/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  if (year <= 0) return null;
  return year <= 2023 ? "2023" : String(year);
}

export function countryStripeYear(date?: string | null) {
  const year = countryVisitYear(date);
  return year && COUNTRY_STRIPE_COLORS[year] ? year : null;
}

export function countryStripeImage(color: string) {
  const size = 16;
  const rgb = color.match(/[a-f0-9]{2}/gi)!.map((value) => parseInt(value, 16));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.abs(((x + y + 0.5) % 8) - 4);
      const alpha = Math.max(0, Math.min(1, 2 - distance));
      data.set([...rgb, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

export function countryStripeLayers(
  countries: CountryVisit[],
  visible = true,
): FillLayerSpecification[] {
  return Object.keys(COUNTRY_STRIPE_COLORS).map((year) => ({
    id: "atlas-visit-stripes-" + year,
    type: "fill",
    source: "atlas-countries",
    layout: { visibility: visible ? "visible" : "none" },
    filter: [
      "in",
      ["get", "code"],
      [
        "literal",
        countries
          .filter(
            (country) =>
              country.visited &&
              countryStripeYear(country.lastVisited) === year,
          )
          .map((country) => country.code),
      ],
    ],
    paint: {
      "fill-pattern": "atlas-visit-stripes-" + year,
      "fill-opacity": 1,
    },
  }));
}
