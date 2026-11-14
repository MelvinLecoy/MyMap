import { useRef, type RefObject } from "react";
import {
  Building2,
  CalendarDays,
  Globe2,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
  icon = false,
  shortAll,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  icon?: boolean;
  shortAll?: string;
}) {
  const text =
    options.find((option) => option.value === value)?.label ?? options[0].label;
  return (
    <label className={icon ? "status-filter" : "continent-filter"}>
      {icon && <SlidersHorizontal size={12} aria-hidden="true" />}
      <span className="filter-display" aria-hidden="true">
        <span className="filter-full">{text}</span>
        <span className="filter-short">
          {value === "all" && shortAll ? shortAll : text}
        </span>
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  );
}

export default function CollectionHeader({
  view,
  search,
  onSearch,
  status,
  onStatus,
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
  status: string;
  onStatus: (value: string) => void;
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
      <div className={`filter-row${countries ? "" : " city-filter-row"}`}>
        {countries ? (
          <>
            <FilterSelect
              label="Filter by visit status"
              value={status}
              onChange={onStatus}
              icon
              shortAll="All visits"
              options={[
                { value: "all", label: "All visit statuses" },
                { value: "not-yet", label: "Not Yet" },
                { value: "planned", label: "Planned" },
                { value: "visited", label: "Visited" },
              ]}
            />
            <FilterSelect
              label="Filter by continent"
              value={continent}
              onChange={onContinent}
              options={[
                { value: "all", label: "All continents" },
                ...continents.map((value) => ({ value, label: value })),
              ]}
            />
          </>
        ) : (
          <>
            <FilterDropdown
              label="Filter by last visited year"
              value={lastVisitYear}
              onChange={onLastVisitYear}
              icon={CalendarDays}
              options={[
                { value: "all", label: "All years", shortLabel: "Year" },
                ...lastVisitYears.map((value) => ({
                  value,
                  label: value === "2023" ? "2023 or before" : value,
                  shortLabel: value === "2023" ? "≤2023" : undefined,
                  color:
                    VISIT_YEAR_COLORS[Number(value) <= 2023 ? "2023" : value],
                })),
              ]}
            />
            <FilterDropdown
              label="Filter by continent"
              value={continent}
              onChange={onContinent}
              icon={Globe2}
              options={[
                {
                  value: "all",
                  label: "All continents",
                  shortLabel: "Continent",
                },
                ...continents.map((value) => ({ value, label: value })),
              ]}
            />
          </>
        )}
        {countries && countrySet && onCountrySet ? (
          <div className="country-count-control">
            {resultCount}
            <ChevronDown size={12} aria-hidden="true" />
            <select
              aria-label="Country list size"
              title={`Showing the ${countrySet}-country list`}
              value={countrySet}
              onChange={(event) =>
                onCountrySet(event.target.value === "197" ? 197 : 195)
              }
            >
              <option value="195">195 countries</option>
              <option value="197">
                197 countries · includes Kosovo and Taiwan
              </option>
            </select>
          </div>
        ) : (
          resultCount
        )}
      </div>
    </div>
  );
}
