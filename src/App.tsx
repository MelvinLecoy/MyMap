import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  ChevronDown,
  ChevronRight,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
  CalendarDays,
  StickyNote,
} from "lucide-react";
import Globe from "./components/Globe";
import MapViewer from "./components/MapViewer";
import atlas from "./generated/atlas.json";
import {
  MAP_STATUS_STORAGE_KEY,
  parseStatusOverrides,
  readStatusOverrides,
  saveStatusOverrides,
} from "./lib/status-storage";
import {
  MAP_STATUSES,
  VISIT_LABELS,
  formatVisitDate,
  type AtlasData,
  type MapStatus,
  type VisitStatus,
} from "./lib/types";
const data = atlas as AtlasData;
function readRoute() {
  const p = new URLSearchParams(window.location.search);
  return { city: p.get("city"), view: p.get("view") === "map" };
}
function Flag({ code }: { code: string | null }) {
  return (
    <span className="country-flag" aria-hidden="true">
      {code && code !== "XK"
        ? [...code.toUpperCase()]
            .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
            .join("")
        : "◌"}
    </span>
  );
}
function Status({ status }: { status: MapStatus }) {
  return (
    <span
      className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}
function VisitMarker({
  visit,
  inline = false,
}: {
  visit: VisitStatus;
  inline?: boolean;
}) {
  const state = visit === "visited" || visit === "planned" ? visit : "not-yet";
  const Icon =
    state === "visited"
      ? CircleCheck
      : state === "planned"
        ? CalendarDays
        : CircleDashed;
  return (
    <span
      className={
        inline
          ? `visit-value visit-value-${state}`
          : `visit-marker visit-marker-${state}`
      }
    >
      <Icon size={inline ? 18 : 20} strokeWidth={1.6} aria-hidden="true" />
      <span>{VISIT_LABELS[visit]}</span>
    </span>
  );
}
export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [continent, setContinent] = useState("all");
  const [statusOverrides, setStatusOverrides] = useState(readStatusOverrides);
  const [saveErrorCity, setSaveErrorCity] = useState<string | null>(null);
  const cities = useMemo(
    () =>
      data.cities.map((city) =>
        Object.hasOwn(statusOverrides, city.id)
          ? { ...city, status: statusOverrides[city.id] }
          : city,
      ),
    [statusOverrides],
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const viewerButton = useRef<HTMLButtonElement>(null);
  const selected = cities.find((c) => c.id === route.city) || null;
  const viewer = Boolean(route.view && selected?.map);
  const updateMapStatus = (id: string, value: MapStatus) => {
    const next = { ...statusOverrides, [id]: value };
    setStatusOverrides(next);
    setSaveErrorCity(saveStatusOverrides(next) ? null : id);
  };
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === MAP_STATUS_STORAGE_KEY || event.key === null) {
        setStatusOverrides(parseStatusOverrides(event.newValue));
        setSaveErrorCity(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const navigate = useCallback(
    (id: string | null, view = false, replace = false) => {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("city", id);
      else url.searchParams.delete("city");
      if (view) url.searchParams.set("view", "map");
      else url.searchParams.delete("view");
      window.history[replace ? "replaceState" : "pushState"]({}, "", url);
      setRoute({ city: id, view });
    },
    [],
  );
  useEffect(() => {
    const listener = () => setRoute(readRoute());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (route.city && !selected) navigate(null, false, true);
    else if (route.view && !selected?.map)
      navigate(selected?.id ?? null, false, true);
  }, [route.city, route.view, selected, navigate]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (selected) navigate(null);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, navigate]);
  const continents = useMemo(
    () =>
      [...new Set(data.cities.map((c) => c.continent).filter(Boolean))].sort(),
    [],
  );
  const filtered = useMemo(() => {
    const query = search
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim();
    return cities
      .filter(
        (c) =>
          `${c.name} ${c.country}`
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .includes(query) &&
          (status === "all" || c.status === status) &&
          (continent === "all" || c.continent === continent),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, status, continent, cities]);
  const visited = data.cities.filter((c) => c.visit === "visited").length;
  const countries = data.countries.filter((c) => c.visited).length;
  const closeViewer = useCallback(() => {
    navigate(selected?.id ?? null);
    setTimeout(() => viewerButton.current?.focus(), 0);
  }, [navigate, selected]);
  return (
    <div className="app-shell">
      <main className={`atlas-layout ${viewer ? "viewer-is-open" : ""}`}>
        <div className="map-stage">
          <Globe
            cities={filtered}
            countries={data.countries}
            selected={selected}
            onSelect={(id) => navigate(id)}
            geonames={data.geonames}
          />
          {viewer && selected && (
            <MapViewer
              key={selected.id}
              city={selected}
              onClose={closeViewer}
            />
          )}
        </div>
        <aside
          className="city-panel"
          aria-label={
            selected ? `${selected.name} city details` : "City collection"
          }
        >
          {!selected ? (
            <>
              <div className="panel-intro">
                <div className="panel-heading">
                  <h1>Cities</h1>
                  <span className="city-total">{data.cities.length}</span>
                </div>
              </div>
              <div className="collection-controls">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a city or country"
                    aria-label="Search cities and countries"
                  />
                  {search ? (
                    <button
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <kbd>⌘ K</kbd>
                  )}
                </label>
                <div className="filter-row">
                  <label className="status-filter">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="Filter by map status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All map statuses</option>
                      {MAP_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  {continents.length > 1 && (
                    <label className="continent-filter">
                      <select
                        aria-label="Filter by continent"
                        value={continent}
                        onChange={(e) => setContinent(e.target.value)}
                      >
                        <option value="all">All continents</option>
                        {continents.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  )}
                  <span className="visually-hidden" aria-live="polite">
                    {filtered.length}{" "}
                    {filtered.length === 1 ? "city" : "cities"}
                  </span>
                </div>
              </div>
              <div className="city-list" aria-label="Cities">
                {filtered.map((city) => (
                  <button
                    key={city.id}
                    className="city-row"
                    onClick={() => navigate(city.id)}
                  >
                    <VisitMarker visit={city.visit} />
                    <span className="city-row-body">
                      <span className="city-row-name">{city.name}</span>
                      <span className="city-row-country">
                        <Flag code={city.countryCode} />
                        <span>{city.country}</span>
                      </span>
                      {city.visit === "visited" && city.lastVisited && (
                        <span className="city-row-year">
                          <span className="visually-hidden">Last visited </span>
                          {city.lastVisited.slice(0, 4)}
                        </span>
                      )}
                      {!city.coordinates && (
                        <span className="location-missing">
                          Location missing
                        </span>
                      )}
                    </span>
                    <Status status={city.status} />
                    <ChevronRight
                      className="row-chevron"
                      size={14}
                      aria-hidden="true"
                    />
                  </button>
                ))}
                {!filtered.length && (
                  <div className="empty-state">
                    <Search size={27} />
                    <h2>No cities found</h2>
                    <p>Try another place or a different map status.</p>
                    <button
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                        setContinent("all");
                      }}
                    >
                      Clear filters
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              <footer className="collection-bottom" aria-label="Visited places">
                <div className="journey-stats">
                  <span className="stats-label">Visited</span>
                  <div>
                    <strong>{countries}</strong>
                    <span>{countries === 1 ? "country" : "countries"}</span>
                  </div>
                  <div>
                    <strong>{visited}</strong>
                    <span>{visited === 1 ? "city" : "cities"}</span>
                  </div>
                </div>
              </footer>
            </>
          ) : (
            <>
              <div className="detail-top">
                <button
                  className="back-to-cities"
                  onClick={() => navigate(null)}
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  All cities
                </button>
                <span
                  className="detail-total"
                  aria-label={`${data.cities.length} cities in collection`}
                >
                  {data.cities.length}
                </span>
              </div>
              <div className="city-detail" key={selected.id}>
                <div className="detail-geography" aria-label="Geography">
                  {[selected.continent, selected.region, selected.subregion]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
                <div className="detail-identity">
                  <div>
                    <h1>{selected.name}</h1>
                    <p className="detail-country">
                      <Flag code={selected.countryCode} />
                      {selected.country}
                    </p>
                  </div>
                  {selected.coordinates && (
                    <div
                      className="detail-coordinates"
                      aria-label="City coordinates"
                    >
                      <MapPin size={14} strokeWidth={1.5} aria-hidden="true" />
                      <div>
                        <span>
                          <span className="visually-hidden">Latitude </span>
                          {Math.abs(selected.coordinates[1]).toFixed(4)}°{" "}
                          {selected.coordinates[1] >= 0 ? "N" : "S"}
                        </span>
                        <span>
                          <span className="visually-hidden">Longitude </span>
                          {Math.abs(selected.coordinates[0]).toFixed(4)}°{" "}
                          {selected.coordinates[0] >= 0 ? "E" : "W"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {selected.map ? (
                  <button
                    className="annotated-button"
                    ref={viewerButton}
                    onClick={() => navigate(selected.id, true)}
                  >
                    <Map size={18} aria-hidden="true" />
                    <span>View My Map</span>
                    <ArrowUpRight size={19} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="no-map-card">
                    <Map size={19} />
                    <div>
                      <strong>A map in the making</strong>
                      <p>
                        {selected.status === "Not Started"
                          ? "This city is waiting for its first pins."
                          : "No annotated map has been added yet."}
                      </p>
                    </div>
                  </div>
                )}
                <div className="detail-facts">
                  <div className="detail-fact-row">
                    <label htmlFor="city-map-status">Map status</label>
                    <span
                      className={`status-picker status-${selected.status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      <select
                        id="city-map-status"
                        value={selected.status}
                        onChange={(event) => {
                          const next = MAP_STATUSES.find(
                            (value) => value === event.target.value,
                          );
                          if (next) updateMapStatus(selected.id, next);
                        }}
                      >
                        {MAP_STATUSES.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                      <ChevronDown size={15} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="detail-fact-row">
                    <span>Visit</span>
                    <VisitMarker visit={selected.visit} inline />
                  </div>
                  {selected.lastVisited && (
                    <div className="detail-fact-row">
                      <span>Last visit</span>
                      <strong>{formatVisitDate(selected.lastVisited)}</strong>
                    </div>
                  )}
                  {!selected.coordinates && (
                    <div className="detail-fact-row">
                      <span>Location</span>
                      <strong>Not yet recorded</strong>
                    </div>
                  )}
                </div>
                {saveErrorCity === selected.id && (
                  <p className="status-save-error" role="status">
                    Status changed for this session. Your browser couldn’t save
                    it for next time.
                  </p>
                )}
                {selected.notes && (
                  <div className="notes-section">
                    <h2>
                      <StickyNote size={14} />
                      Notes
                    </h2>
                    <p>{selected.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
