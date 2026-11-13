import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapInstance,
  type ExpressionSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import {
  Plus,
  Minus,
  Globe2,
  LocateFixed,
  Maximize2,
  Compass,
  MapPin,
  MousePointer2,
} from "lucide-react";
import {
  asset,
  cityFeatures,
  fillColors,
  initialZoom,
  localStyle,
  MAP_CONFIG,
  simplifyProviderStyle,
} from "../lib/map-style";
import { LABEL_FONTS, LABEL_SIZES } from "../lib/map-typography";
import { MAP_COLORS } from "../lib/palette";
import type { City, CountryVisit } from "../lib/types";
import "maplibre-gl/dist/maplibre-gl.css";
interface Props {
  cities: City[];
  countries: CountryVisit[];
  selected: City | null;
  onSelect: (id: string) => void;
  geonames: boolean;
  viewControl?: ReactNode;
}
export default function Globe({
  cities,
  countries,
  selected,
  onSelect,
  geonames,
  viewControl,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const current = useRef({ cities, countries, selected, onSelect });
  current.current = { cities, countries, selected, onSelect };
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [regional, setRegional] = useState(false);
  const [position, setPosition] = useState("43.0° N  /  25.0° E");
  const [provider, setProvider] = useState(false);
  const [hint, setHint] = useState(true);
  useEffect(() => {
    if (!container.current) return;
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
        crossSourceCollisions: false,
        canvasContextAttributes: { antialias: true },
      });
    } catch {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: [
          '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>',
          ...(geonames
            ? [
                '<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>',
              ]
            : []),
        ],
      }),
      "bottom-right",
    );
    const decorate = () => {
      if (map.getSource("atlas-countries")) return;
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
            ) as ExpressionSpecification,
            "fill-opacity": 0.95,
          },
        },
        firstLabel,
      );
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
            "line-opacity": 0.8,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.35,
              4,
              0.85,
              10,
              1.4,
            ],
          },
        },
        firstLabel,
      );
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
        cluster: true,
        clusterRadius: MAP_CONFIG.clusterRadius,
        clusterMaxZoom: MAP_CONFIG.clusterMaxZoom,
      });
      map.addLayer({
        id: "city-cluster-ring",
        type: "circle",
        source: "atlas-cities",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": 23,
          "circle-color": MAP_COLORS.clusterHalo,
          "circle-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "city-clusters",
        type: "circle",
        source: "atlas-cities",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": 16,
          "circle-color": MAP_COLORS.clusterFill,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": MAP_COLORS.clusterStroke,
        },
      });
      map.addLayer({
        id: "city-cluster-counts",
        type: "symbol",
        source: "atlas-cities",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Semibold"],
          "text-size": 12,
        },
        paint: { "text-color": MAP_COLORS.clusterText },
      });
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
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            3.5,
            3,
            6,
            5,
            8.5,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "id"], current.current.selected?.id ?? ""],
            MAP_COLORS.pinSelectedOutline,
            MAP_COLORS.pinOutline,
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "id"], current.current.selected?.id ?? ""],
            3,
            2,
          ],
        },
      });
      map.addLayer({
        id: "city-labels",
        type: "symbol",
        source: "atlas-cities",
        minzoom: MAP_CONFIG.labelMinZoom,
        filter: ["!", ["has", "point_count"]],
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
    map.on("dragstart", () => setHint(false));
    const pickCityFeature = (point: { x: number; y: number }) => {
      if (!map.getSource("atlas-cities") || !map.getLayer("city-pins"))
        return undefined;
      const rendered = map.queryRenderedFeatures([point.x, point.y], {
        layers: ["city-clusters", "city-pins"],
      });
      if (rendered[0]) return rendered[0];
      // MapLibre 5's globe hit testing can miss rendered circles at orbit scale.
      // Project the existing clustered source features for a screen-space fallback.
      const center = map.getCenter();
      const radians = Math.PI / 180;
      return map
        .querySourceFeatures("atlas-cities")
        .filter((f) => f.geometry.type === "Point")
        .map((f) => {
          const [lng, lat] = (f.geometry as { coordinates: number[] })
            .coordinates;
          const facing =
            Math.sin(center.lat * radians) * Math.sin(lat * radians) +
            Math.cos(center.lat * radians) *
              Math.cos(lat * radians) *
              Math.cos((lng - center.lng) * radians);
          const projected = map.project([lng, lat]);
          return {
            feature: f,
            distance:
              facing > 0
                ? Math.hypot(projected.x - point.x, projected.y - point.y)
                : Infinity,
          };
        })
        .filter(
          ({ feature, distance }) =>
            distance <= (feature.properties.cluster ? 21 : 14),
        )
        .sort((a, b) => a.distance - b.distance)[0]?.feature;
    };
    map.on("click", async (e) => {
      const f = pickCityFeature(e.point);
      if (!f || f.geometry.type !== "Point") return;
      if (!f.properties.cluster) {
        if (f.properties.id) current.current.onSelect(f.properties.id);
        return;
      }
      try {
        const zoom = await (
          map.getSource("atlas-cities") as GeoJSONSource
        ).getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({
          center: f.geometry.coordinates as [number, number],
          zoom: Math.min(zoom + 0.3, MAP_CONFIG.maxZoom),
          duration: motionDuration(700),
        });
      } catch {
        /* A simultaneous filter change can replace a cluster. */
      }
    });
    map.on("mousemove", (e) => {
      map.getCanvas().style.cursor = pickCityFeature(e.point) ? "pointer" : "";
    });
    const resize = new ResizeObserver(() => map.resize());
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
          map.setStyle(simplifyProviderStyle(style));
          setProvider(true);
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
      map.remove();
      mapRef.current = null;
    };
  }, [geonames]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("atlas-cities") as GeoJSONSource | undefined;
    source?.setData(cityFeatures(cities));
  }, [cities]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("city-pins")) return;
    const id = selected?.id ?? "";
    map.setFilter("city-selection-halo", ["==", ["get", "id"], id]);
    map.setPaintProperty("city-pins", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], id],
      MAP_COLORS.pinSelectedOutline,
      MAP_COLORS.pinOutline,
    ]);
    map.setPaintProperty("city-pins", "circle-stroke-width", [
      "case",
      ["==", ["get", "id"], id],
      3,
      2,
    ]);
  }, [selected, ready]);
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
    map.flyTo({
      center: selected.coordinates,
      zoom: window.innerWidth < 650 ? 4.2 : 4.1,
      duration: motionDuration(1400),
      essential: false,
    });
    setHint(false);
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
    setHint(true);
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
      />
      <div className="map-topline">
        {viewControl ?? (
          <span className="map-view-badge">
            <Globe2 size={15} />
            {regional ? "Regional view" : "Globe view"}
          </span>
        )}
        <span
          className="map-live-dot"
          title={provider ? "OpenFreeMap atlas" : "Bundled Natural Earth atlas"}
        >
          <i />
          {provider ? "OPENFREEMAP ATLAS" : "NATURAL EARTH ATLAS"}
        </span>
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
            <div className="zoom-controls">
              <button
                aria-label="Zoom in"
                onClick={() =>
                  mapRef.current?.zoomIn({ duration: motionDuration(350) })
                }
              >
                <Plus size={20} />
              </button>
              <button
                aria-label="Zoom out"
                onClick={() =>
                  mapRef.current?.zoomOut({ duration: motionDuration(350) })
                }
              >
                <Minus size={20} />
              </button>
            </div>
            <button
              className="map-control-single"
              aria-label="Return to globe"
              title="Return to globe"
              onClick={reset}
            >
              <LocateFixed size={19} />
            </button>
          </div>
          <button
            className="fullscreen-control"
            aria-label="Toggle map fullscreen"
            onClick={fullscreen}
          >
            <Maximize2 size={17} />
          </button>
          <div className="map-legend" aria-label="Map legend">
            <span>
              <i className="legend-country" />
              Visited country
            </span>
            <span>
              <i className="legend-pin" />
              Visited city
            </span>
          </div>
          {!regional && hint && (
            <div className="globe-hint">
              <MousePointer2 size={13} />
              <span>
                Drag to explore <b>·</b> Scroll to get closer
              </span>
            </div>
          )}
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
