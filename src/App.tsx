import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Map,
  Search,
  X,
  CalendarDays,
  StickyNote,
  FlaskConical,
} from "lucide-react";
import Globe from "./components/Globe";
import MapViewer from "./components/MapViewer";
import CityName from "./components/CityName";
import CollectionFooter from "./components/CollectionFooter";
import CollectionHeader, {
  CollectionTabs,
  type CollectionView,
} from "./components/CollectionHeader";
import countrySeed from "../data/countries.sample.json";
import {
  buildCountryRecords,
  countryKey,
  matchesVisit,
  searchText,
} from "./lib/countries";
import EditorControls, {
  type EditorControlsHandle,
} from "./components/EditorControls";
import AccessModeSwitch from "./components/AccessModeSwitch";
import atlas from "./generated/atlas.json";
import { useCoordinateLayout } from "./lib/use-coordinate-layout";
import { useRemoteAtlas } from "./lib/use-remote-atlas";
import { supabase } from "./lib/supabase";
import { deriveCountries } from "./lib/cloud-data";
import {
  COLLECTION_STATUS_STORAGE_KEY,
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
const statusStorageKey = data.demo
  ? MAP_STATUS_STORAGE_KEY
  : COLLECTION_STATUS_STORAGE_KEY;
function readRoute(): {
  city: string | null;
  view: boolean;
  panel: CollectionView;
  country: string | null;
} {
  const p = new URLSearchParams(window.location.search);
  return {
    city: p.get("city"),
    view: p.get("view") === "map",
    panel:
      !p.has("city") && p.get("panel") === "countries" ? "countries" : "cities",
    country: p.get("country"),
  };
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
  const cloud = useRemoteAtlas(data, data.demo ? null : supabase);
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [continent, setContinent] = useState("all");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryVisit, setCountryVisit] = useState("all");
  const [countryContinent, setCountryContinent] = useState("all");
  const [statusOverrides, setStatusOverrides] = useState(() =>
    readStatusOverrides(statusStorageKey),
  );
  const [saveErrorCity, setSaveErrorCity] = useState<string | null>(null);
  const cities = useMemo(
    () =>
      cloud.enabled
        ? cloud.cities
        : data.cities.map((city) =>
            Object.hasOwn(statusOverrides, city.id)
              ? { ...city, status: statusOverrides[city.id] }
              : city,
          ),
    [statusOverrides, cloud.enabled, cloud.cities],
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const viewerButton = useRef<HTMLButtonElement>(null);
  const editorControls = useRef<EditorControlsHandle>(null);
  const selected = cities.find((c) => c.id === route.city) || null;
  const { ref: identityRef, layout: coordinateLayout } = useCoordinateLayout(
    selected?.id,
  );
  const viewer = Boolean(route.view && selected?.map);
  const updateMapStatus = (id: string, value: MapStatus) => {
    if (cloud.enabled) {
      void cloud.saveStatus(id, value);
      return;
    }
    const next = { ...statusOverrides, [id]: value };
    setStatusOverrides(next);
    setSaveErrorCity(saveStatusOverrides(next, statusStorageKey) ? null : id);
  };
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === statusStorageKey || event.key === null) {
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
      if (id) {
        url.searchParams.set("city", id);
        url.searchParams.delete("panel");
      } else url.searchParams.delete("city");
      if (view) url.searchParams.set("view", "map");
      else url.searchParams.delete("view");
      window.history[replace ? "replaceState" : "pushState"]({}, "", url);
      setRoute(readRoute());
    },
    [],
  );
  useEffect(() => {
    const listener = () => setRoute(readRoute());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (cloud.enabled && !cloud.ready) return;
    if (route.city && !selected) navigate(null, false, true);
    else if (route.view && !selected?.map)
      navigate(selected?.id ?? null, false, true);
  }, [route.city, route.view, selected, navigate, cloud.enabled, cloud.ready]);
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
    () => [...new Set(cities.map((c) => c.continent).filter(Boolean))].sort(),
    [cities],
  );
  const countryView = route.panel === "countries";
  const countryRecords = useMemo(
    () => buildCountryRecords(countrySeed.countries, cities),
    [cities],
  );
  const scopedCountry = countryRecords.find(
    (country) => country.code === route.country,
  );
  const countryContinents = useMemo(
    () =>
      [
        ...new Set(
          countryRecords.map((country) => country.continent).filter(Boolean),
        ),
      ].sort(),
    [countryRecords],
  );
  const filteredCountries = useMemo(() => {
    const query = searchText(countrySearch);
    return countryRecords.filter(
      (country) =>
        searchText(`${country.name} ${country.code}`).includes(query) &&
        matchesVisit(country.visit, countryVisit) &&
        (countryContinent === "all" || country.continent === countryContinent),
    );
  }, [countryRecords, countrySearch, countryVisit, countryContinent]);
  const filtered = useMemo(() => {
    const query = searchText(search);
    return cities
      .filter(
        (city) =>
          searchText(`${city.name} ${city.country}`).includes(query) &&
          (status === "all" || city.status === status) &&
          (continent === "all" || city.continent === continent) &&
          (!scopedCountry || countryKey(city) === scopedCountry.code),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, status, continent, cities, scopedCountry]);
  const mapCities = useMemo(() => {
    if (!countryView) return filtered;
    const codes = new Set(filteredCountries.map((country) => country.code));
    return cities.filter((city) => codes.has(countryKey(city)));
  }, [countryView, filtered, filteredCountries, cities]);
  const changePanel = useCallback((panel: CollectionView) => {
    const current = readRoute();
    if (current.panel === panel && !current.city && !current.country) return;
    const url = new URL(window.location.href);
    for (const key of ["city", "view", "country"]) url.searchParams.delete(key);
    if (panel === "countries") url.searchParams.set("panel", panel);
    else url.searchParams.delete("panel");
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  }, []);
  const openCountry = (code: string) => {
    const url = new URL(window.location.href);
    for (const key of ["city", "view", "panel"]) url.searchParams.delete(key);
    url.searchParams.set("country", code);
    setSearch("");
    setStatus("all");
    setContinent("all");
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  };
  const clearCountry = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("country");
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  };
  const resetFilters = () => {
    if (countryView) {
      setCountrySearch("");
      setCountryVisit("all");
      setCountryContinent("all");
    } else {
      setSearch("");
      setStatus("all");
      setContinent("all");
      if (route.country) clearCountry();
    }
  };
  const countryData = useMemo(
    () =>
      cloud.enabled ? deriveCountries(cities, data.countries) : data.countries,
    [cloud.enabled, cities],
  );
  const visited = cities.filter((c) => c.visit === "visited").length;
  const countries = countryData.filter((c) => c.visited).length;
  const closeViewer = useCallback(() => {
    navigate(selected?.id ?? null);
    setTimeout(() => viewerButton.current?.focus(), 0);
  }, [navigate, selected]);
  return (
    <div className="app-shell">
      <main className={`atlas-layout ${viewer ? "viewer-is-open" : ""}`}>
        <div className="map-stage">
          <Globe
            cities={mapCities}
            countries={countryData}
            selected={selected}
            onSelect={(id) => navigate(id)}
            geonames={data.geonames}
            viewControl={
              cloud.enabled ? (
                <AccessModeSwitch
                  editing={cloud.canEdit}
                  busy={
                    cloud.signingOut || Object.keys(cloud.pending).length > 0
                  }
                  signingOut={cloud.signingOut}
                  onEditor={() => editorControls.current?.openSignIn()}
                  onViewer={cloud.signOut}
                />
              ) : undefined
            }
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
            selected
              ? `${selected.name} city details`
              : countryView
                ? "Country collection"
                : "City collection"
          }
        >
          <CollectionTabs value={route.panel} onChange={changePanel} />
          <div
            id="collection-content"
            className="collection-content"
            role="tabpanel"
            aria-labelledby={`${route.panel}-tab`}
          >
            {!selected ? (
              <>
                <CollectionHeader
                  view={route.panel}
                  search={countryView ? countrySearch : search}
                  onSearch={countryView ? setCountrySearch : setSearch}
                  status={countryView ? countryVisit : status}
                  onStatus={countryView ? setCountryVisit : setStatus}
                  continent={countryView ? countryContinent : continent}
                  onContinent={countryView ? setCountryContinent : setContinent}
                  continents={countryView ? countryContinents : continents}
                  count={
                    countryView ? filteredCountries.length : filtered.length
                  }
                  searchRef={searchRef}
                />
                {!countryView && scopedCountry && (
                  <div className="country-scope">
                    <Flag code={scopedCountry.code} />
                    <span>{scopedCountry.name}</span>
                    <button
                      type="button"
                      aria-label="Clear country filter"
                      onClick={clearCountry}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div
                  className="city-list"
                  aria-label={countryView ? "Countries" : "Cities"}
                >
                  {countryView && countrySeed.sample && (
                    <p className="country-sample-note">
                      <FlaskConical size={12} aria-hidden="true" />
                      Sample country data
                    </p>
                  )}
                  {countryView
                    ? filteredCountries.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          className="country-row"
                          onClick={() => openCountry(country.code)}
                        >
                          <VisitMarker visit={country.visit} />
                          <span className="city-row-body">
                            <span className="city-row-name">
                              {country.name}
                            </span>
                            <span className="city-row-country">
                              <Flag code={country.code} />
                              <span>{country.continent}</span>
                            </span>
                          </span>
                          <span className="country-city-count">
                            {country.cityCount}{" "}
                            {country.cityCount === 1 ? "city" : "cities"}
                          </span>
                          <ChevronRight
                            className="row-chevron"
                            size={14}
                            aria-hidden="true"
                          />
                        </button>
                      ))
                    : filtered.map((city) => (
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
                                <span className="visually-hidden">
                                  Last visited{" "}
                                </span>
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
                  {!(countryView
                    ? filteredCountries.length
                    : filtered.length) && (
                    <div className="empty-state">
                      <Search size={27} />
                      <h2>
                        {countryView ? "No countries found" : "No cities found"}
                      </h2>
                      <p>
                        {countryView
                          ? "Try another country or visit status."
                          : "Try another place or a different map status."}
                      </p>
                      <button onClick={resetFilters}>
                        Clear filters
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="detail-top">
                  <button
                    className="back-to-cities"
                    onClick={() => navigate(null)}
                  >
                    <ArrowLeft size={17} aria-hidden="true" />
                    <span>
                      {scopedCountry
                        ? `${scopedCountry.name} (${scopedCountry.cityCount} ${scopedCountry.cityCount === 1 ? "city" : "cities"})`
                        : `All cities (${cities.length})`}
                    </span>
                  </button>
                </div>
                <div className="city-detail" key={selected.id}>
                  <section
                    className="detail-place-card"
                    aria-label={`${selected.name} location`}
                  >
                    <div className="detail-geography" aria-label="Geography">
                      {[selected.continent, selected.region, selected.subregion]
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                    <div
                      ref={identityRef}
                      className={`detail-identity detail-identity--${coordinateLayout}`}
                    >
                      <div>
                        <h1>
                          <CityName name={selected.name} />
                        </h1>
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
                      )}
                    </div>
                  </section>
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
                      <span className="map-status-label">
                        <label htmlFor="city-map-status">Map status</label>
                        {cloud.pending[selected.id] && (
                          <span className="map-status-saving" role="status">
                            <LoaderCircle
                              size={14}
                              className="editor-spinner"
                              aria-hidden="true"
                            />
                            <span className="visually-hidden">
                              Saving map status…
                            </span>
                          </span>
                        )}
                      </span>
                      <span
                        className={`status-picker status-${selected.status.toLowerCase().replaceAll(" ", "-")}`}
                      >
                        <select
                          id="city-map-status"
                          aria-busy={Boolean(cloud.pending[selected.id])}
                          value={selected.status}
                          disabled={
                            cloud.enabled &&
                            (!cloud.canEdit ||
                              !cloud.ready ||
                              Boolean(cloud.loadError) ||
                              Boolean(cloud.pending[selected.id]))
                          }
                          title={
                            cloud.enabled && !cloud.canEdit
                              ? "Sign in as the editor to change map status"
                              : undefined
                          }
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
                  {cloud.enabled && cloud.saveError?.id === selected.id && (
                    <p className="status-save-error" role="alert">
                      {cloud.saveError.message}
                    </p>
                  )}
                  {!cloud.enabled && saveErrorCity === selected.id && (
                    <p className="status-save-error" role="status">
                      Status changed for this session. Your browser couldn’t
                      save it for next time.
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
          </div>
          {cloud.enabled ? (
            <EditorControls
              ref={editorControls}
              cloud={cloud}
              countries={countries}
              visited={visited}
            />
          ) : (
            <CollectionFooter countries={countries} visited={visited} />
          )}
        </aside>
      </main>
    </div>
  );
}
