import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapInstance,
  type ExpressionSpecification,
  type StyleSpecification,
  type SymbolLayerSpecification,
  type MapMouseEvent,
} from "maplibre-gl";
import { Globe2, LocateFixed, Maximize2, Compass, MapPin } from "lucide-react";
import {
  asset,
  cityFeatures,
  countryFillOpacity,
  fillColors,
  initialZoom,
  localStyle,
  MAP_CONFIG,
  simplifyProviderStyle,
  type MapLayer,
} from "../lib/map-style";
import MapLayerControl from "./MapLayerControl";
import { LABEL_FONTS, LABEL_SIZES } from "../lib/map-typography";
import {
  COUNTRY_STRIPE_COLORS,
  MAP_COLORS,
  VISIT_YEAR_COLORS,
} from "../lib/palette";
import {
  countryStripeImage,
  countryStripeLayers,
} from "../lib/country-stripes";
import { providerLabelFilters } from "../lib/map-labels";
import { countryBounds, positionBounds } from "../lib/country-camera";
import { countryKey } from "../lib/countries";
import {
  createCountrySelection,
  restoreCountryPaint,
} from "../lib/country-selection";
import type { FeatureCollection } from "geojson";
import type { City, CountryVisit, Place } from "../lib/types";
import { isPlace, placeOutlineFeatures, placePinFeatures } from "../lib/places";
import {
  createPlaceSelection,
  focusPlace,
  placePinImage,
} from "../lib/place-selection";
import "maplibre-gl/dist/maplibre-gl.css";
interface Props {
  cities: City[];
  places: Place[];
  countries: CountryVisit[];
  selected: City | null;
  selectedCountry?: string | null;
  onSelect: (id: string) => void;
  onSelectCountry: (code: string) => void;
  countryCodes: string[];
  viewControl?: ReactNode;
}
export default function Globe({
  cities,
  places,
  countries,
  selected,
  selectedCountry = null,
  onSelect,
  onSelectCountry,
  countryCodes,
  viewControl,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const providerLabels = useRef<SymbolLayerSpecification[]>([]);
  const countrySelection = useRef<ReturnType<
    typeof createCountrySelection
  > | null>(null);
  const placeSelection = useRef<ReturnType<typeof createPlaceSelection> | null>(
    null,
  );
  const previousPlaces = useRef<Place[]>([]);
  const configurePointerRef = useRef<(() => void) | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayer>("standard");
  const current = useRef({
    cities,
    places,
    countries,
    selected,
    selectedCountry,
    onSelect,
    onSelectCountry,
    countryCodes: new Set(countryCodes),
    mapLayer,
  });
  current.current = {
    cities,
    places,
    countries,
    selected,
    selectedCountry,
    onSelect,
    onSelectCountry,
    countryCodes: new Set(countryCodes),
    mapLayer,
  };
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [regional, setRegional] = useState(false);
  const [position, setPosition] = useState("43.0° N  /  25.0° E");
  useEffect(() => {
    if (!container.current) return;
    providerLabels.current = [];
    let map: MapInstance;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: localStyle(),
        center: MAP_CONFIG.center,
        zoom: initialZoom(
          container.current.clientWidth,
          container.current.clientHeight,
        ),
        minZoom: -0.3,
        maxZoom: MAP_CONFIG.maxZoom,
        attributionControl: false,
        renderWorldCopies: false,
        crossSourceCollisions: true,
        canvasContextAttributes: { antialias: true },
      });
    } catch {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    const canvas = map.getCanvas();
    const pointerPoint = { x: 0, y: 0 };
    let pointerFrame = 0;
    const pointerMedia = window.matchMedia(
      "(min-width: 761px) and (hover: hover) and (pointer: fine)",
    );
    const decorate = () => {
      if (map.getSource("atlas-countries")) return;
      for (const layer of providerLabelFilters(
        providerLabels.current,
        current.current.cities,
      )) {
        if (map.getLayer(layer.id))
          map.setFilter(layer.id, layer.filter ?? null);
      }
      map.setProjection({ type: "globe" });
      if (!map.hasImage("atlas-city-dot")) {
        const size = 12;
        const data = new Uint8Array(size * size * 4);
        const color = MAP_COLORS.cityLabel
          .match(/[a-f0-9]{2}/gi)!
          .map((c) => parseInt(c, 16));
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const alpha = Math.max(
              0,
              Math.min(
                1,
                4 - Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5),
              ),
            );
            data.set([...color, Math.round(alpha * 255)], i);
          }
        map.addImage(
          "atlas-city-dot",
          { width: size, height: size, data },
          { pixelRatio: 2 },
        );
      }
      map.setSky({
        "sky-color": MAP_COLORS.sky,
        "horizon-color": MAP_COLORS.horizon,
        "sky-horizon-blend": 0.2,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 3, 0],
      });
      const firstLabel = map
        .getStyle()
        .layers.find((l) => l.type === "symbol")?.id;
      map.addSource("atlas-countries", {
        type: "geojson",
        data: asset("atlas/countries.geojson"),
        tolerance: 0.1,
        promoteId: "code",
      });
      map.addSource("atlas-admin1", {
        type: "geojson",
        data: asset("atlas/admin1.geojson"),
        tolerance: 0.2,
      });
      map.addSource("atlas-grid", {
        type: "geojson",
        data: asset("atlas/graticule.geojson"),
      });
      map.addSource("atlas-labels", {
        type: "geojson",
        data: asset("atlas/labels.geojson"),
      });
      map.addLayer(
        {
          id: "atlas-land",
          type: "fill",
          source: "atlas-countries",
          paint: {
            "fill-color": fillColors(
              current.current.countries,
              current.current.mapLayer,
            ) as ExpressionSpecification,
            "fill-opacity": countryFillOpacity(current.current.countries),
          },
        },
        firstLabel,
      );
      for (const [year, color] of Object.entries(COUNTRY_STRIPE_COLORS)) {
        const name = "atlas-visit-stripes-" + year;
        if (!map.hasImage(name)) {
          map.addImage(name, countryStripeImage(color), { pixelRatio: 2 });
        }
      }
      for (const layer of countryStripeLayers(
        current.current.countries,
        current.current.mapLayer === "standard",
      )) {
        map.addLayer(layer, firstLabel);
      }
      map.addLayer(
        {
          id: "atlas-grid",
          type: "line",
          source: "atlas-grid",
          paint: {
            "line-color": MAP_COLORS.grid,
            "line-opacity": 0.12,
            "line-width": 0.7,
          },
        },
        firstLabel,
      );
      map.addLayer(
        {
          id: "atlas-admin1",
          type: "line",
          source: "atlas-admin1",
          minzoom: 3.7,
          paint: {
            "line-color": MAP_COLORS.adminBoundary,
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3.7,
              0,
              4.1,
              0.44,
              8,
              0.65,
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.45, 10, 1],
          },
        },
        firstLabel,
      );
      map.addLayer(
        {
          id: "atlas-borders",
          type: "line",
          source: "atlas-countries",
          paint: {
            "line-color": MAP_COLORS.boundary,
            "line-opacity": 0.9,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.45,
              4,
              1,
              10,
              1.5,
            ],
          },
        },
        firstLabel,
      );
      countrySelection.current?.destroy();
      countrySelection.current = null;
      configurePointer();
      for (const [id, minzoom, filter] of [
        ["large", 0, ["<=", ["get", "rank"], 3]],
        [
          "medium",
          2,
          ["all", [">", ["get", "rank"], 3], ["<=", ["get", "rank"], 5]],
        ],
        ["small", 3, [">", ["get", "rank"], 5]],
      ] as const) {
        map.addLayer({
          id: `atlas-names-${id}`,
          type: "symbol",
          source: "atlas-labels",
          minzoom,
          filter: filter as unknown as ExpressionSpecification,
          layout: {
            "text-field": ["get", "name"],
            "text-font": [LABEL_FONTS.country],
            "text-size": LABEL_SIZES.country,
            "text-max-width": 8,
            "text-padding": 10,
            "text-letter-spacing": 0.01,
          },
          paint: {
            "text-color": MAP_COLORS.label,
            "text-halo-color": MAP_COLORS.labelHalo,
            "text-halo-width": 1.1,
            "text-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.8,
              2,
              0.96,
            ],
          },
        });
      }
      map.addSource("atlas-cities", {
        type: "geojson",
        data: cityFeatures(current.current.cities),
        cluster: false,
      });
      map.addSource("atlas-places", {
        type: "geojson",
        data: placePinFeatures(current.current.places),
        cluster: false,
      });
      map.addSource("atlas-place-outlines", {
        type: "geojson",
        promoteId: "id",
        data: placeOutlineFeatures(current.current.places),
      });
      previousPlaces.current = current.current.places;
      placeSelection.current?.destroy();
      placeSelection.current = createPlaceSelection(map, motionDuration);
      placeSelection.current.setPlace(
        current.current.selected && isPlace(current.current.selected)
          ? current.current.selected.id
          : null,
      );
      map.addLayer({
        id: "city-selection-halo",
        type: "circle",
        source: "atlas-cities",
        filter: ["==", ["get", "id"], current.current.selected?.id ?? ""],
        paint: {
          "circle-radius": 19,
          "circle-color": MAP_COLORS.selectionHalo,
          "circle-opacity": 0.16,
        },
      });
      map.addLayer({
        id: "city-pins",
        type: "circle",
        source: "atlas-cities",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            2.5,
            3,
            3.5,
            5,
            4,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "id"], current.current.selected?.id ?? ""],
            MAP_COLORS.pinSelectedOutline,
            MAP_COLORS.pinOutline,
          ],
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "city-labels",
        type: "symbol",
        source: "atlas-cities",
        minzoom: MAP_CONFIG.labelMinZoom,
        layout: {
          "text-field": ["get", "name"],
          "text-font": [LABEL_FONTS.city],
          "text-size": LABEL_SIZES.city,
          "text-anchor": "left",
          "text-offset": [1, 0],
          "text-padding": 8,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": MAP_COLORS.cityLabel,
          "text-halo-color": MAP_COLORS.cityLabelHalo,
          "text-halo-width": 1.4,
        },
      });
      if (!map.hasImage("place-pin"))
        map.addImage("place-pin", placePinImage(), { pixelRatio: 2 });
      map.addLayer({
        id: "place-pins",
        type: "symbol",
        source: "atlas-places",
        layout: {
          "icon-image": "place-pin",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      map.addLayer({
        id: "place-labels",
        type: "symbol",
        source: "atlas-places",
        minzoom: MAP_CONFIG.labelMinZoom,
        layout: {
          "text-field": ["get", "name"],
          "text-font": [LABEL_FONTS.city],
          "text-size": LABEL_SIZES.city,
          "text-anchor": "left",
          "text-offset": [1, 0],
          "text-padding": 8,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": MAP_COLORS.cityLabel,
          "text-halo-color": MAP_COLORS.cityLabelHalo,
          "text-halo-width": 1.4,
        },
      });
      map.once("idle", () => setReady(true));
    };
    map.on("style.load", decorate);
    const move = () => {
      const { lng, lat } = map.getCenter();
      setPosition(
        `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}  /  ${Math.abs(lng).toFixed(1)}° ${lng >= 0 ? "E" : "W"}`,
      );
      setRegional(map.getZoom() >= 3);
    };
    map.on("moveend", move);
    const cancelPointerPick = () => {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
    };
    const setCursor = (cursor: string) => {
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    };
    const clearPointer = () => {
      cancelPointerPick();
      setCursor("");
    };
    const pickCityFeature = (
      point: { x: number; y: number },
      cityRadius = 9,
    ) => {
      if (!map.getSource("atlas-cities") || !map.getLayer("city-pins"))
        return undefined;
      const rendered = map.queryRenderedFeatures([point.x, point.y], {
        layers: ["place-pins", "place-labels", "city-pins"],
      });
      if (rendered[0]) return rendered[0];
      // MapLibre 5's globe hit testing can miss rendered circles at orbit scale.
      // Project the existing city features for a screen-space fallback.
      const center = map.getCenter();
      const radians = Math.PI / 180;
      const sinCenter = Math.sin(center.lat * radians);
      const cosCenter = Math.cos(center.lat * radians);
      let closest:
        | ReturnType<MapInstance["querySourceFeatures"]>[number]
        | undefined;
      let closestDistance = Infinity;
      for (const feature of [
        ...map.querySourceFeatures("atlas-places"),
        ...map.querySourceFeatures("atlas-cities"),
      ]) {
        if (feature.geometry.type !== "Point") continue;
        const [lng, lat] = feature.geometry.coordinates;
        const facing =
          sinCenter * Math.sin(lat * radians) +
          cosCenter *
            Math.cos(lat * radians) *
            Math.cos((lng - center.lng) * radians);
        if (!(facing > 0)) continue;
        const projected = map.project([lng, lat]);
        const distance = Math.hypot(
          projected.x - point.x,
          projected.y - point.y,
        );
        const radius = feature.properties.kind === "place" ? 14 : cityRadius;
        if (distance <= radius && distance < closestDistance) {
          closest = feature;
          closestDistance = distance;
        }
      }
      return closest;
    };
    const pickCountry = (point: { x: number; y: number }) => {
      if (!map.getLayer("atlas-land")) return null;
      const feature = map
        .queryRenderedFeatures([point.x, point.y], { layers: ["atlas-land"] })
        .find((feature) =>
          current.current.countryCodes.has(feature.properties.code),
        );
      return (feature?.properties.code as string | undefined) ?? null;
    };
    map.on("click", (e) => {
      cancelPointerPick();
      const f = pickCityFeature(e.point);
      if (!f || f.geometry.type !== "Point") {
        const code = pickCountry(e.point);
        if (code) {
          countrySelection.current?.setSelectedCountry(code);
          current.current.onSelectCountry(code);
        }
        return;
      }
      if (f.properties.id) current.current.onSelect(f.properties.id);
    });
    const handlePointer = (e: MapMouseEvent) => {
      if (map.isMoving() || !pointerMedia.matches) {
        clearPointer();
        return;
      }
      pointerPoint.x = e.point.x;
      pointerPoint.y = e.point.y;
      if (pointerFrame) return;
      // High-rate pointers only need one hit test for the next visible frame.
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (map.isMoving() || !pointerMedia.matches) {
          clearPointer();
          return;
        }
        const city = pickCityFeature(pointerPoint, 9);
        const code = city ? null : pickCountry(pointerPoint);
        setCursor(city || code ? "pointer" : "");
      });
    };
    function configurePointer() {
      map.off("mousemove", handlePointer);
      map.off("movestart", clearPointer);
      canvas.removeEventListener("mouseleave", clearPointer);
      canvas.removeEventListener("touchstart", clearPointer);
      if (!pointerMedia.matches) {
        clearPointer();
        countrySelection.current?.destroy();
        countrySelection.current = null;
        restoreCountryPaint(
          map,
          current.current.countries,
          current.current.mapLayer,
        );
        return;
      }
      if (!map.getLayer("atlas-land")) return;
      if (!countrySelection.current) {
        const firstLabel = map
          .getStyle()
          .layers.find((layer) => layer.type === "symbol")?.id;
        countrySelection.current = createCountrySelection(
          map,
          current.current.countries,
          firstLabel,
          motionDuration,
          current.current.mapLayer,
        );
      }
      countrySelection.current.setSelectedCountry(
        current.current.selected ? null : current.current.selectedCountry,
      );
      clearPointer();
      map.on("movestart", clearPointer);
      canvas.addEventListener("mouseleave", clearPointer);
      canvas.addEventListener("touchstart", clearPointer, { passive: true });
      map.on("mousemove", handlePointer);
    }
    configurePointerRef.current = configurePointer;
    pointerMedia.addEventListener("change", configurePointer);
    const resize = new ResizeObserver(() => {
      map.resize();
      const entry = current.current.selected;
      if (entry && isPlace(entry)) focusPlace(map, entry, 0);
    });
    resize.observe(container.current);
    // Start with the bundled atlas immediately. A compatible provider adds closer-scale labels.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 5000);
    fetch(
      import.meta.env.VITE_MAP_STYLE_URL ||
        "https://tiles.openfreemap.org/styles/dark",
      { signal: abort.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error("Style unavailable");
        return r.json() as Promise<StyleSpecification>;
      })
      .then((style) => {
        if (!abort.signal.aborted) {
          setReady(false);
          const simplified = simplifyProviderStyle(style);
          providerLabels.current = simplified.layers.filter(
            (layer): layer is SymbolLayerSpecification =>
              layer.type === "symbol",
          );
          map.setStyle(simplified);
        }
      })
      .catch(() => {
        /* The bundled atlas is a complete offline fallback. */
      })
      .finally(() => clearTimeout(timeout));
    const contextLost = () => {
      setUnavailable(true);
      setReady(false);
    };
    map.getCanvas().addEventListener("webglcontextlost", contextLost);
    return () => {
      abort.abort();
      clearTimeout(timeout);
      resize.disconnect();
      cancelPointerPick();
      configurePointerRef.current = null;
      pointerMedia.removeEventListener("change", configurePointer);
      countrySelection.current?.destroy();
      countrySelection.current = null;
      placeSelection.current?.destroy();
      placeSelection.current = null;
      map.getCanvas().removeEventListener("mouseleave", clearPointer);
      map.getCanvas().removeEventListener("touchstart", clearPointer);
      map.off("mousemove", handlePointer);
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("atlas-cities") as GeoJSONSource | undefined;
    source?.setData(cityFeatures(cities));
    if (map) {
      for (const layer of providerLabelFilters(
        providerLabels.current,
        cities,
      )) {
        if (map.getLayer(layer.id))
          map.setFilter(layer.id, layer.filter ?? null);
      }
    }
  }, [cities]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("atlas-places")) return;
    if (
      places.length === previousPlaces.current.length &&
      places.every((place, index) => place === previousPlaces.current[index])
    )
      return;
    previousPlaces.current = places;
    (map?.getSource("atlas-places") as GeoJSONSource | undefined)?.setData(
      placePinFeatures(places),
    );
    (
      map?.getSource("atlas-place-outlines") as GeoJSONSource | undefined
    )?.setData(placeOutlineFeatures(places));
  }, [places]);
  useEffect(() => {
    if (ready)
      placeSelection.current?.setPlace(
        selected && isPlace(selected) ? selected.id : null,
      );
  }, [selected, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("atlas-land")) return;
    if (countrySelection.current)
      countrySelection.current.updateCountries(countries, mapLayer);
    else restoreCountryPaint(map, countries, mapLayer);
  }, [countries, ready, mapLayer]);
  useEffect(() => {
    configurePointerRef.current?.();
  }, [ready]);
  useEffect(() => {
    if (ready)
      countrySelection.current?.setSelectedCountry(
        selected ? null : selectedCountry,
      );
  }, [selectedCountry, selected, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("city-pins")) return;
    const id = selected && !isPlace(selected) ? selected.id : "";
    map.setFilter("city-selection-halo", ["==", ["get", "id"], id]);
    map.setPaintProperty("city-pins", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], id],
      MAP_COLORS.pinSelectedOutline,
      MAP_COLORS.pinOutline,
    ]);
  }, [selected, ready]);
  const previousCountry = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!selectedCountry || selected) {
      previousCountry.current = null;
      return;
    }
    if (!map || !ready || previousCountry.current === selectedCountry) return;
    let cancelled = false;
    const focusCountry = async () => {
      let bounds = null;
      try {
        const source = map.getSource("atlas-countries") as
          | GeoJSONSource
          | undefined;
        const geometry = await source?.getData();
        if (geometry?.type === "FeatureCollection")
          bounds = countryBounds(
            geometry as FeatureCollection,
            selectedCountry,
          );
      } catch {
        // Known city coordinates still provide a useful view if boundaries are unavailable.
      }
      bounds ??= positionBounds(
        cities
          .filter(
            (city) => countryKey(city) === selectedCountry && city.coordinates,
          )
          .map((city) => city.coordinates!),
      );
      if (cancelled || !bounds) return;
      previousCountry.current = selectedCountry;
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 48, right: 48 },
        maxZoom: 6,
        bearing: 0,
        pitch: 0,
        duration: motionDuration(1400),
        essential: false,
      });
    };
    void focusCountry();
    return () => {
      cancelled = true;
    };
  }, [selectedCountry, selected, ready, cities]);
  const previousCity = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!selected) {
      previousCity.current = null;
      return;
    }
    if (
      !map ||
      !ready ||
      !selected.coordinates ||
      previousCity.current === selected.id
    )
      return;
    previousCity.current = selected.id;
    if (isPlace(selected)) {
      focusPlace(map, selected, motionDuration(1400));
      return;
    }
    map.flyTo({
      center: selected.coordinates,
      zoom: window.innerWidth < 650 ? 4.2 : 4.1,
      duration: motionDuration(1400),
      essential: false,
    });
  }, [selected, ready]);
  const reset = () => {
    mapRef.current?.flyTo({
      center: MAP_CONFIG.center,
      zoom: container.current
        ? initialZoom(
            container.current.clientWidth,
            container.current.clientHeight,
          )
        : MAP_CONFIG.zoom,
      bearing: 0,
      pitch: 0,
      duration: motionDuration(1200),
    });
  };
  const fullscreen = () => {
    const parent = container.current?.parentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (parent?.requestFullscreen) void parent.requestFullscreen();
  };
  return (
    <section className="globe" aria-label="Interactive travel globe">
      <div
        className="map-canvas"
        ref={container}
        data-testid="map-canvas"
        data-ready={ready}
        data-layer={mapLayer}
        data-selected-country={selected ? "" : (selectedCountry ?? "")}
        data-selected-place={selected && isPlace(selected) ? selected.id : ""}
      />
      <div className="map-topline">
        {!unavailable && (
          <button
            className="fullscreen-control"
            aria-label="Toggle map fullscreen"
            onClick={fullscreen}
          >
            <Maximize2 size={17} />
          </button>
        )}
        {viewControl ?? (
          <span className="map-view-badge">
            <Globe2 size={15} />
            {regional ? "Regional view" : "Globe view"}
          </span>
        )}
      </div>
      {!unavailable && !ready && (
        <div className="map-loading">
          <span className="loader" />
          Preparing your world
        </div>
      )}
      {unavailable && (
        <div className="map-unavailable">
          <Globe2 size={36} />
          <h2>A world beyond this browser</h2>
          <p>
            The interactive globe needs WebGL. Your cities and annotated maps
            are still available in the panel.
          </p>
        </div>
      )}
      {!unavailable && (
        <>
          <div className="map-controls">
            <button
              className="map-control-single"
              aria-label="Return to globe"
              title="Return to globe"
              onClick={reset}
            >
              <LocateFixed size={19} />
            </button>
          </div>
          <MapLayerControl value={mapLayer} onChange={setMapLayer} />
          <div className="map-legend" aria-label="Map legend">
            <span>
              <i
                className="legend-pin"
                style={{ backgroundColor: MAP_COLORS.pinVisited }}
              />
              Visited city
            </span>
            {places.length > 0 && (
              <span>
                <i className="legend-place" />
                Place
              </span>
            )}
            <div
              className="map-year-legend"
              aria-label="Country last visit year"
            >
              <span className="legend-year-caption">Last visit</span>
              {[
                "2026",
                ...Object.keys(COUNTRY_STRIPE_COLORS).sort().reverse(),
              ].map((year) => {
                const color = COUNTRY_STRIPE_COLORS[year];
                return (
                  <span
                    key={year}
                    title={year === "2023" ? "2023 or earlier" : undefined}
                  >
                    <i
                      className="legend-country"
                      style={{
                        backgroundColor:
                          mapLayer === "last-visit"
                            ? VISIT_YEAR_COLORS[year]
                            : MAP_COLORS.visitedCountry,
                        backgroundImage:
                          mapLayer === "standard" && color
                            ? "repeating-linear-gradient(135deg, " +
                              color +
                              " 0 1px, transparent 1px 3px)"
                            : undefined,
                      }}
                    />
                    {year === "2023" ? "≤2023" : year}
                  </span>
                );
              })}
              {mapLayer === "last-visit" && (
                <span>
                  <i
                    className="legend-country"
                    style={{
                      backgroundColor: MAP_COLORS.unvisitedCountry,
                      borderColor: MAP_COLORS.boundary,
                    }}
                  />
                  Never
                </span>
              )}
            </div>
          </div>
          <div className="coordinates">
            <Compass size={12} />
            {position}
          </div>
        </>
      )}
      <div className="map-mobile-identity">
        <MapPin size={13} /> A personal atlas
      </div>
    </section>
  );
}
function motionDuration(duration: number) {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : duration;
}
