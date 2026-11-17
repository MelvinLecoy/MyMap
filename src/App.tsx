import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Map,
  Search,
  StickyNote,
  FlaskConical,
} from "lucide-react";
import Globe from "./components/Globe";
import MapViewer from "./components/MapViewer";
import CityName from "./components/CityName";
import CountryDetail from "./components/CountryDetail";
import CityVisitHistory from "./components/CityVisitHistory";
import CityCollectionSummary, {
  type CityScoreSort,
} from "./components/CityCollectionSummary";
import CountryCollectionSummary, {
  type CountryScoreSort,
} from "./components/CountryCollectionSummary";
import {
  CityRow,
  CountryVisitMarker,
  CountryVisitOrderBadge,
  CountryCityCount,
  Flag,
  VisitMarker,
  EntryCountries,
} from "./components/CollectionItems";
import CollectionFooter from "./components/CollectionFooter";
import {
  countryProfileHref,
  followProfileLink,
} from "./lib/profile-navigation";
import CollectionHeader, {
  CollectionTabs,
  type CollectionView,
} from "./components/CollectionHeader";
import countrySeed from "./generated/countries.json";
import countryGeography from "./generated/country-geography.json";
import {
  applyCityGeography,
  applyCountryGeography,
} from "./lib/country-geography";
import {
  buildCountryRecords,
  countryDisplayName,
  countryDisplayVisitOrders,
  countryKey,
  latestCountryVisit,
  countryVisitSummary,
  inCountrySet,
  mergeCountryVisits,
  matchesVisit,
  searchText,
  type CountrySet,
} from "./lib/countries";
import EditorControls, {
  type EditorControlsHandle,
} from "./components/EditorControls";
import AccessModeSwitch from "./components/AccessModeSwitch";
import atlas from "./generated/atlas.json";
import { useCoordinateLayout } from "./lib/use-coordinate-layout";
import { useRemoteAtlas } from "./lib/use-remote-atlas";
import { useRemoteCountries } from "./lib/use-remote-countries";
import { supabase } from "./lib/supabase";
import { useRemotePlaces } from "./lib/use-remote-places";
import { entryInCountry, isPlace } from "./lib/places";
import { deriveCountries } from "./lib/cloud-data";
import { cityVisitSummary } from "./lib/city-visits";
import {
  COLLECTION_STATUS_STORAGE_KEY,
  MAP_STATUS_STORAGE_KEY,
  parseStatusOverrides,
  readStatusOverrides,
  saveStatusOverrides,
} from "./lib/status-storage";
import {
  MAP_STATUSES,
  MAP_STATUS_LABELS,
  formatVisitDate,
  type AtlasData,
  type MapStatus,
} from "./lib/types";
const data = atlas as unknown as AtlasData;
const initialPlaces = data.places ?? [];
const statusStorageKey = data.demo
  ? MAP_STATUS_STORAGE_KEY
  : COLLECTION_STATUS_STORAGE_KEY;
function readRoute(): {
  city: string | null;
  view: boolean;
  panel: CollectionView;
  country: string | null;
  countrySet: CountrySet;
} {
  const p = new URLSearchParams(window.location.search);
  return {
    city: p.get("place") ?? p.get("city"),
    view: p.get("view") === "map",
    panel:
      p.get("panel") === "countries" || p.has("country")
        ? "countries"
        : "cities",
    country: p.get("country"),
    countrySet: p.get("countrySet") === "197" ? 197 : 195,
  };
}
export default function App() {
  const cloud = useRemoteAtlas(data, data.demo ? null : supabase);
  const countryCloud = useRemoteCountries(
    countrySeed.countries,
    data.demo ? null : supabase,
  );
  const placesCloud = useRemotePlaces(
    initialPlaces,
    data.demo ? null : supabase,
    cloud.canEdit,
  );
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [continent, setContinent] = useState("all");
  const [lastVisitYear, setLastVisitYear] = useState("all");
  const [visitedOnly, setVisitedOnly] = useState(false);
  const [citySort, setCitySort] = useState<CityScoreSort>("alphabetical");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryVisit, setCountryVisit] = useState("all");
  const [countryContinent, setCountryContinent] = useState("all");
  const [countryLastVisitYear, setCountryLastVisitYear] = useState("all");
  const [countrySort, setCountrySort] =
    useState<CountryScoreSort>("visit-order");
  const [statusOverrides, setStatusOverrides] = useState(() =>
    readStatusOverrides(statusStorageKey),
  );
  const [saveErrorCity, setSaveErrorCity] = useState<string | null>(null);
  const cities = useMemo(
    () =>
      applyCityGeography(
        cloud.enabled
          ? cloud.cities
          : data.cities.map((city) =>
              Object.hasOwn(statusOverrides, city.id)
                ? { ...city, status: statusOverrides[city.id] }
                : city,
            ),
        countryGeography.countries,
      ),
    [statusOverrides, cloud.enabled, cloud.cities],
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const viewerButton = useRef<HTMLButtonElement>(null);
  const editorControls = useRef<EditorControlsHandle>(null);
  const places = useMemo(
    () =>
      cloud.enabled
        ? placesCloud.places
        : placesCloud.places.map((place) =>
            Object.hasOwn(statusOverrides, place.id)
              ? { ...place, status: statusOverrides[place.id] }
              : place,
          ),
    [cloud.enabled, placesCloud.places, statusOverrides],
  );
  const entries = useMemo(() => [...cities, ...places], [cities, places]);
  const selected = entries.find((entry) => entry.id === route.city) || null;
  const profileCloud = selected && isPlace(selected) ? placesCloud : cloud;
  const { ref: identityRef, layout: coordinateLayout } = useCoordinateLayout(
    selected?.id,
  );
  const viewer = Boolean(route.view && selected?.map);
  const updateMapStatus = (id: string, value: MapStatus) => {
    if (cloud.enabled) {
      if (places.some((place) => place.id === id))
        void placesCloud.saveStatus(id, value);
      else void cloud.saveStatus(id, value);
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
        const entry = entries.find((entry) => entry.id === id);
        const key = entry && isPlace(entry) ? "place" : "city";
        url.searchParams.set(key, id);
        url.searchParams.delete(key === "place" ? "city" : "place");
        const country = url.searchParams.get("country");
        if (country && entry && entryInCountry(entry, country)) {
          url.searchParams.set("panel", "countries");
        } else {
          url.searchParams.delete("panel");
          url.searchParams.delete("country");
        }
      } else {
        url.searchParams.delete("city");
        url.searchParams.delete("place");
      }
      if (view) url.searchParams.set("view", "map");
      else url.searchParams.delete("view");
      window.history[replace ? "replaceState" : "pushState"]({}, "", url);
      setRoute(readRoute());
    },
    [entries],
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
  const continents = useMemo(
    () => [...new Set(cities.map((c) => c.continent).filter(Boolean))].sort(),
    [cities],
  );
  const cityLastVisits = useMemo(
    () =>
      new globalThis.Map(
        entries.map((city) => [
          city.id,
          cityVisitSummary(city.visits ?? []).lastVisited ?? city.lastVisited,
        ]),
      ),
    [entries],
  );
  const lastVisitYears = useMemo(
    () =>
      [
        ...new Set(
          [...cityLastVisits.values()]
            .filter((date) => date != null)
            .map((date) =>
              Number(date.slice(0, 4)) <= 2023 ? "2023" : date.slice(0, 4),
            ),
        ),
      ].sort((a, b) => Number(b) - Number(a)),
    [cityLastVisits],
  );
  const countryView = route.panel === "countries";
  const countryRecords = useMemo(
    () =>
      buildCountryRecords(
        applyCountryGeography(
          countryCloud.countries,
          countryGeography.countries,
        ),
        cities,
      ),
    [cities, countryCloud.countries],
  );
  const countriesInView = countryRecords;
  const countryOrders = useMemo(
    () => countryDisplayVisitOrders(countryRecords, route.countrySet),
    [countryRecords, route.countrySet],
  );
  const scopedCountry = countryRecords.find(
    (country) => country.code === route.country,
  );
  const countryCities = useMemo(
    () =>
      scopedCountry
        ? entries
            .filter((city) => entryInCountry(city, scopedCountry.code))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [entries, scopedCountry],
  );
  const countryContinents = useMemo(
    () =>
      [
        ...new Set(
          countriesInView.map((country) => country.continent).filter(Boolean),
        ),
      ].sort(),
    [countriesInView],
  );
  const countryLastVisits = useMemo(
    () =>
      new globalThis.Map(
        countriesInView.map((country) => [
          country.code,
          latestCountryVisit(country),
        ]),
      ),
    [countriesInView],
  );
  const countryLastVisitYears = useMemo(
    () =>
      [
        ...new Set(
          [...countryLastVisits.values()]
            .filter((date) => date != null)
            .map((date) =>
              Number(date.slice(0, 4)) <= 2023 ? "2023" : date.slice(0, 4),
            ),
        ),
      ].sort((a, b) => Number(b) - Number(a)),
    [countryLastVisits],
  );
  const visitedCountrySet =
    countryVisit === "visited" ? route.countrySet : null;
  const countryScope = useMemo(() => {
    const matches = countriesInView.filter((country) => {
      const year = countryLastVisits.get(country.code)?.slice(0, 4);
      return (
        matchesVisit(country.visit, countryVisit) &&
        (visitedCountrySet == null ||
          countrySeed.sample ||
          inCountrySet(country, visitedCountrySet)) &&
        (countryContinent === "all" ||
          country.continent === countryContinent) &&
        (countryLastVisitYear === "all" ||
          (year != null &&
            (countryLastVisitYear === "2023"
              ? Number(year) <= 2023
              : year === countryLastVisitYear)))
      );
    });
    return matches;
  }, [
    countriesInView,
    countryVisit,
    visitedCountrySet,
    countryContinent,
    countryLastVisitYear,
    countryLastVisits,
  ]);
  const filteredCountries = useMemo(() => {
    const query = searchText(countrySearch);
    const matches = countryScope.filter((country) =>
      searchText(
        `${country.name} ${country.code} ${(country.aliases ?? []).join(" ")}`,
      ).includes(query),
    );
    if (countrySort === "alphabetical") return matches;
    if (countrySort === "visit-order")
      return matches.sort(
        (a, b) =>
          (a.firstVisitOrder ?? Infinity) - (b.firstVisitOrder ?? Infinity) ||
          a.name.localeCompare(b.name),
      );
    return matches.sort(
      (a, b) =>
        (countryVisitSummary(b)[countrySort] ?? 0) -
          (countryVisitSummary(a)[countrySort] ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [countryScope, countrySearch, countrySort]);
  const countryScoreboard = useMemo(
    () =>
      countrySeed.sample
        ? filteredCountries
        : filteredCountries.filter((country) =>
            inCountrySet(country, route.countrySet),
          ),
    [filteredCountries, route.countrySet],
  );
  const cityScope = useMemo(() => {
    const query = searchText(search);
    return entries
      .filter((city) => {
        const year = cityLastVisits.get(city.id)?.slice(0, 4);
        return (
          searchText(`${city.name} ${city.country}`).includes(query) &&
          (continent === "all" || city.continent === continent) &&
          (lastVisitYear === "all" ||
            (year != null &&
              (lastVisitYear === "2023"
                ? Number(year) <= 2023
                : year === lastVisitYear))) &&
          (!scopedCountry || entryInCountry(city, scopedCountry.code))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    search,
    continent,
    lastVisitYear,
    cityLastVisits,
    entries,
    scopedCountry,
  ]);
  const cityProgressScope = useMemo(
    () =>
      cityScope.filter(
        (city) => !visitedOnly || (!isPlace(city) && city.visit === "visited"),
      ),
    [cityScope, visitedOnly],
  );
  const filtered = useMemo(() => {
    const matches = cityProgressScope.filter(
      (city) => status === "all" || city.status === status,
    );
    if (citySort === "alphabetical") return matches;
    const scores = new globalThis.Map(
      matches.map((city) => [city.id, cityVisitSummary(city.visits ?? [])]),
    );
    return matches.sort(
      (a, b) =>
        scores.get(b.id)![citySort] - scores.get(a.id)![citySort] ||
        a.name.localeCompare(b.name),
    );
  }, [cityProgressScope, status, citySort]);
  const filteredCities = useMemo(
    () => filtered.filter((entry) => !isPlace(entry)),
    [filtered],
  );
  const mapEntries = useMemo(() => {
    if (countryView && scopedCountry) return countryCities;
    if (!countryView) return filtered;
    const codes = new Set(countryScope.map((country) => country.code));
    return entries.filter((entry) =>
      isPlace(entry)
        ? entry.countries.some((country) => codes.has(country.code))
        : codes.has(countryKey(entry)),
    );
  }, [
    countryView,
    scopedCountry,
    countryCities,
    filtered,
    countryScope,
    entries,
  ]);
  const globeCities = useMemo(
    () => mapEntries.filter((entry) => !isPlace(entry)),
    [mapEntries],
  );
  const globePlaces = useMemo(() => {
    const visible = mapEntries.filter(isPlace);
    return selected &&
      isPlace(selected) &&
      !visible.some((place) => place.id === selected.id)
      ? [...visible, selected]
      : visible;
  }, [mapEntries, selected]);
  const changePanel = useCallback((panel: CollectionView) => {
    const current = readRoute();
    if (current.panel === panel && !current.city && !current.country) return;
    const url = new URL(window.location.href);
    if (current.countrySet === 197) url.searchParams.set("countrySet", "197");
    for (const key of ["city", "place", "view", "country"])
      url.searchParams.delete(key);
    if (panel === "countries") url.searchParams.set("panel", panel);
    else url.searchParams.delete("panel");
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  }, []);
  const openCountry = (code: string) => {
    const url = new URL(window.location.href);
    for (const key of ["city", "place", "view"]) url.searchParams.delete(key);
    url.searchParams.set("panel", "countries");
    url.searchParams.set("country", code);
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  };
  const clearCountry = useCallback(() => {
    const url = new URL(window.location.href);
    if (readRoute().countrySet === 197)
      url.searchParams.set("countrySet", "197");
    for (const key of ["country", "city", "place", "view"])
      url.searchParams.delete(key);
    url.searchParams.set("panel", "countries");
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  }, []);
  const changeCountrySet = (set: CountrySet) => {
    const url = new URL(window.location.href);
    if (set === 197) url.searchParams.set("countrySet", "197");
    else url.searchParams.delete("countrySet");
    window.history.pushState({}, "", url);
    setRoute(readRoute());
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (countryView && (route.country || selected)) clearCountry();
        else if (selected) navigate(null);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [countryView, route.country, selected, navigate, clearCountry]);
  const resetFilters = () => {
    if (countryView) {
      setCountrySearch("");
      setCountryVisit("all");
      setCountryContinent("all");
      setCountryLastVisitYear("all");
      setCountrySort("visit-order");
    } else {
      setSearch("");
      setStatus("all");
      setContinent("all");
      setLastVisitYear("all");
      setVisitedOnly(false);
      setCitySort("alphabetical");
      if (route.country) clearCountry();
    }
  };
  const countryData = useMemo(
    () =>
      mergeCountryVisits(
        cloud.enabled
          ? deriveCountries(cities, data.countries)
          : data.countries,
        countryRecords,
      ),
    [cloud.enabled, cities, countryRecords],
  );
  const visited = cities.filter((c) => c.visit === "visited").length;
  const countries = countryData.filter(
    (c) =>
      c.visited &&
      (countrySeed.sample ||
        countriesInView.some((country) => country.code === c.code)),
  ).length;
  const closeViewer = useCallback(() => {
    navigate(selected?.id ?? null);
    setTimeout(() => viewerButton.current?.focus(), 0);
  }, [navigate, selected]);
  return (
    <div className="app-shell">
      <main className={`atlas-layout ${viewer ? "viewer-is-open" : ""}`}>
        <div className="map-stage">
          <Globe
            cities={globeCities}
            places={globePlaces}
            countries={countryData}
            selected={selected}
            selectedCountry={scopedCountry?.code ?? null}
            onSelect={(id) => navigate(id)}
            onSelectCountry={openCountry}
            countryCodes={countriesInView.map((country) => country.code)}
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
              : countryView && scopedCountry
                ? `${scopedCountry.name} country details`
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
            {countryView && countryCloud.error && (
              <p className="country-history-scope" role="status">
                {countryCloud.error}{" "}
                <button
                  type="button"
                  onClick={() => void countryCloud.refresh()}
                >
                  Retry
                </button>
              </p>
            )}
            {!selected && countryView && scopedCountry ? (
              <CountryDetail
                key={scopedCountry.code}
                country={scopedCountry}
                cities={countryCities}
                visitOrder={countryOrders.get(scopedCountry.code) ?? null}
                onBack={clearCountry}
                onSelectCity={(id) => navigate(id)}
              />
            ) : !selected ? (
              <>
                {countryView ? (
                  <CountryCollectionSummary
                    countries={countryScoreboard}
                    countrySet={
                      countrySeed.sample ? undefined : route.countrySet
                    }
                    onCountrySet={changeCountrySet}
                    visitedOnly={countryVisit === "visited"}
                    sort={countrySort}
                    onVisitedOnly={() => {
                      setCountryVisit((current) =>
                        current === "visited" ? "all" : "visited",
                      );
                      setCountrySort((current) =>
                        current === "alphabetical" ? current : "visit-order",
                      );
                    }}
                    onSort={(sort) =>
                      setCountrySort((current) =>
                        current === sort ? "visit-order" : sort,
                      )
                    }
                  />
                ) : (
                  <CityCollectionSummary
                    cities={filteredCities}
                    scope={cityProgressScope}
                    status={status}
                    onStatus={setStatus}
                    visitedOnly={visitedOnly}
                    sort={citySort}
                    onVisitedOnly={() => setVisitedOnly((value) => !value)}
                    onSort={(sort) =>
                      setCitySort((current) =>
                        current === sort ? "alphabetical" : sort,
                      )
                    }
                  />
                )}
                <CollectionHeader
                  view={route.panel}
                  search={countryView ? countrySearch : search}
                  onSearch={countryView ? setCountrySearch : setSearch}
                  continent={countryView ? countryContinent : continent}
                  onContinent={countryView ? setCountryContinent : setContinent}
                  continents={countryView ? countryContinents : continents}
                  lastVisitYear={
                    countryView ? countryLastVisitYear : lastVisitYear
                  }
                  onLastVisitYear={
                    countryView ? setCountryLastVisitYear : setLastVisitYear
                  }
                  lastVisitYears={
                    countryView ? countryLastVisitYears : lastVisitYears
                  }
                  count={
                    countryView
                      ? filteredCountries.length
                      : filteredCities.length
                  }
                  placeCount={
                    countryView ? 0 : filtered.length - filteredCities.length
                  }
                  searchRef={searchRef}
                />
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
                        <a
                          key={country.code}
                          href={countryProfileHref(country.code)}
                          className="country-row"
                          onClick={(event) =>
                            followProfileLink(event, () =>
                              openCountry(country.code),
                            )
                          }
                        >
                          <CountryVisitMarker country={country} />
                          <span className="city-row-body">
                            <span className="city-row-name">
                              {country.name}
                            </span>
                            <span className="city-row-country">
                              <Flag code={country.code} />
                              <span>{country.continent}</span>
                            </span>
                          </span>
                          <CountryVisitOrderBadge
                            code={country.code}
                            order={countryOrders.get(country.code) ?? null}
                          />
                          <span className="country-row-tail">
                            <CountryCityCount count={country.cityCount} />
                            <ChevronRight
                              className="row-chevron"
                              size={14}
                              aria-hidden="true"
                            />
                          </span>
                        </a>
                      ))
                    : filtered.map((city) => (
                        <CityRow
                          key={city.id}
                          city={city}
                          onSelect={(id) => navigate(id)}
                        />
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
                          ? "Try another country, year or continent."
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
                          {isPlace(selected) ? (
                            <EntryCountries entry={selected} />
                          ) : (
                            <>
                              <Flag code={selected.countryCode} />
                              {countryDisplayName(
                                selected.country,
                                selected.countryCode,
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      {selected.coordinates && (
                        <div
                          className="detail-coordinates"
                          aria-label={
                            isPlace(selected)
                              ? "Place coordinates"
                              : "City coordinates"
                          }
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
                            ? `This ${isPlace(selected) ? "place" : "city"} is waiting for its first pins.`
                            : "No annotated map has been added yet."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="detail-facts">
                    <div className="detail-fact-row">
                      <span className="map-status-label">
                        <label htmlFor="city-map-status">Map status</label>
                        {profileCloud.pending[selected.id] && (
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
                          aria-busy={Boolean(profileCloud.pending[selected.id])}
                          value={selected.status}
                          disabled={
                            cloud.enabled &&
                            (!cloud.canEdit ||
                              !profileCloud.ready ||
                              Boolean(profileCloud.loadError) ||
                              Boolean(profileCloud.pending[selected.id]))
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
                            <option key={value} value={value}>
                              {MAP_STATUS_LABELS[value]}
                            </option>
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
                  <CityVisitHistory
                    visits={selected.visits}
                    countryCode={selected.countryCode}
                  />
                  {cloud.enabled &&
                    profileCloud.saveError?.id === selected.id && (
                      <p className="status-save-error" role="alert">
                        {profileCloud.saveError.message}
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
