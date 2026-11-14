import { useRef, type RefObject } from "react";
import { Building2, CalendarDays, Globe2, Search, X } from "lucide-react";
import type { CountrySet } from "../lib/countries";
import { VISIT_YEAR_COLORS } from "../lib/palette";
import FilterDropdown from "./FilterDropdown";

export type CollectionView = "cities" | "countries";

export function CollectionTabs({
  value,
  onChange,
}: {
  value: CollectionView;
  onChange: (view: CollectionView) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <nav className="collection-navigation" aria-label="Collection navigation">
      <div
        className="collection-tabs"
        role="tablist"
        aria-label="Collection view"
      >
        {(["cities", "countries"] as const).map((view, index) => {
          const Icon = view === "cities" ? Building2 : Globe2;
          return (
            <button
              key={view}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${view}-tab`}
              aria-controls="collection-content"
              aria-selected={value === view}
              tabIndex={value === view ? 0 : -1}
              onClick={() => onChange(view)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                onChange(next === 0 ? "cities" : "countries");
                refs.current[next]?.focus();
              }}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{view === "cities" ? "Cities" : "Countries"}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function CollectionHeader({
  view,
  search,
  onSearch,
  continent,
  onContinent,
  continents,
  lastVisitYear,
  onLastVisitYear,
  lastVisitYears,
  count,
  searchRef,
  countrySet,
  onCountrySet,
}: {
  view: CollectionView;
  search: string;
  onSearch: (value: string) => void;
  continent: string;
  onContinent: (value: string) => void;
  continents: string[];
  lastVisitYear: string;
  onLastVisitYear: (value: string) => void;
  lastVisitYears: string[];
  count: number;
  searchRef: RefObject<HTMLInputElement | null>;
  countrySet?: CountrySet;
  onCountrySet?: (set: CountrySet) => void;
}) {
  const countries = view === "countries";
  const noun = countries
    ? count === 1
      ? "country"
      : "countries"
    : count === 1
      ? "city"
      : "cities";
  const resultCount = (
    <span
      className="collection-count"
      role="status"
      aria-live="polite"
      aria-label={`${count} ${noun}`}
    >
      <strong className={countries ? "country-total" : "city-total"}>
        {count}
      </strong>{" "}
      <span>{noun}</span>
    </span>
  );
  return (
    <div className="collection-controls">
      <h1 className="visually-hidden">{countries ? "Countries" : "Cities"}</h1>
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={countries ? "Find a country" : "Find a city or country"}
          aria-label={
            countries ? "Search countries" : "Search cities and countries"
          }
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearch("")}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd>⌘ K</kbd>
        )}
      </label>
      <div
        className={`filter-row city-filter-row${countries ? " country-filter-row" : ""}`}
      >
        <FilterDropdown
          label="Filter by last visited year"
          value={lastVisitYear}
          onChange={onLastVisitYear}
          icon={CalendarDays}
          options={[
            {
              value: "all",
              label: "All years",
              shortLabel: "Year last visited",
            },
            ...lastVisitYears.map((value) => ({
              value,
              label: value === "2023" ? "2023 or before" : value,
              shortLabel: value === "2023" ? "≤2023" : undefined,
              color: VISIT_YEAR_COLORS[Number(value) <= 2023 ? "2023" : value],
            })),
          ]}
        />
        <FilterDropdown
          label="Filter by continent"
          value={continent}
          onChange={onContinent}
          icon={Globe2}
          options={[
            { value: "all", label: "All continents", shortLabel: "Continent" },
            ...continents.map((value) => ({ value, label: value })),
          ]}
        />
        {countries && countrySet && onCountrySet ? (
          <div className="country-count-control">
            <FilterDropdown
              label="Country list size"
              value={String(countrySet)}
              onChange={(value) => onCountrySet(value === "197" ? 197 : 195)}
              valueContent={resultCount}
              options={[
                { value: "195", label: "195" },
                { value: "197", label: "197 (🇽🇰 & 🇹🇼)" },
              ]}
            />
          </div>
        ) : (
          resultCount
        )}
      </div>
    </div>
  );
}
