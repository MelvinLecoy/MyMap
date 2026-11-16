import type { Map as MapInstance, ExpressionSpecification } from "maplibre-gl";
import type { Place } from "./types";
import { placeBounds } from "./places";

export function focusPlace(map: MapInstance, place: Place, duration: number) {
  const bounds = placeBounds(place);
  if (bounds)
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 100, left: 48, right: 48 },
      maxZoom: 5,
      duration,
      essential: false,
    });
  else if (place.coordinates)
    map.flyTo({
      center: place.coordinates,
      zoom: 5,
      duration,
      essential: false,
    });
}

const selected: ExpressionSpecification = [
  "boolean",
  ["feature-state", "placeSelected"],
  false,
];
const opacity = (value: number): ExpressionSpecification => [
  "case",
  selected,
  value,
  0,
];

export function placePinImage() {
  const size = 32,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const distance = Math.abs(x - 15.5) + Math.abs(y - 15.5);
      const alpha = Math.max(0, Math.min(1, 14 - distance));
      const color = distance > 10 ? [253, 255, 250] : [40, 119, 108];
      const offset = (y * size + x) * 4;
      data.set([...color, Math.round(alpha * 255)], offset);
    }
  return { width: size, height: size, data };
}

/** Selection-only shared-source layers; animation changes translation, never geometry. */
export function createPlaceSelection(
  map: MapInstance,
  duration: (milliseconds: number) => number,
) {
  const layers = [
    "place-selection-shadow",
    "place-selection-shadow-edge",
    "place-selection-fill",
    "place-selection-outline",
  ];
  map.addLayer({
    id: layers[0],
    type: "fill",
    source: "atlas-place-outlines",
    paint: {
      "fill-color": "#173d3c",
      "fill-opacity": opacity(0.1),
      "fill-translate": [0, 1],
      "fill-translate-anchor": "viewport",
      "fill-opacity-transition": { duration: 0 },
    },
  });
  map.addLayer({
    id: layers[1],
    type: "line",
    source: "atlas-place-outlines",
    paint: {
      "line-color": "#173d3c",
      "line-width": 3,
      "line-blur": 1.2,
      "line-opacity": opacity(0.18),
      "line-translate": [0, 1],
      "line-translate-anchor": "viewport",
      "line-opacity-transition": { duration: 0 },
    },
  });
  map.addLayer({
    id: layers[2],
    type: "fill",
    source: "atlas-place-outlines",
    paint: {
      "fill-color": "#63b28a",
      "fill-opacity": opacity(0.1),
      "fill-translate-anchor": "viewport",
      "fill-translate-transition": { duration: 0 },
      "fill-opacity-transition": { duration: 0 },
    },
  });
  map.addLayer({
    id: layers[3],
    type: "line",
    source: "atlas-place-outlines",
    paint: {
      "line-color": "#28776c",
      "line-width": 1.5,
      "line-opacity": opacity(0.95),
      "line-translate-anchor": "viewport",
      "line-translate-transition": { duration: 0 },
      "line-opacity-transition": { duration: 0 },
    },
  });
  let active: string | null = null,
    target: string | null = null,
    frame = 0,
    progress = 0,
    disposed = false;
  function state(id: string, value: boolean) {
    if (map.getSource("atlas-place-outlines"))
      map.setFeatureState(
        { source: "atlas-place-outlines", id },
        { placeSelected: value },
      );
  }
  return {
    setPlace(id: string | null) {
      if (disposed || id === target) return;
      cancelAnimationFrame(frame);
      target = id;
      if (id && id !== active) {
        if (active) state(active, false);
        active = id;
        progress = 0;
        state(id, true);
      }
      const from = progress,
        to = id ? 1 : 0,
        start = performance.now(),
        milliseconds = duration(id ? 160 : 120);
      const tick = (now: number) => {
        if (disposed) return;
        const fraction = milliseconds
          ? Math.min(1, (now - start) / milliseconds)
          : 1;
        progress = from + (to - from) * (1 - (1 - fraction) ** 3);
        const offset = [0, milliseconds ? -2 * progress : 0];
        map.setPaintProperty(layers[2], "fill-translate", offset, {
          validate: false,
        });
        map.setPaintProperty(layers[3], "line-translate", offset, {
          validate: false,
        });
        if (fraction < 1) frame = requestAnimationFrame(tick);
        else if (!target && active) {
          state(active, false);
          active = null;
        }
      };
      tick(start);
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      if (active) state(active, false);
      for (const id of layers.reverse())
        if (map.getLayer(id)) map.removeLayer(id);
    },
  };
}
