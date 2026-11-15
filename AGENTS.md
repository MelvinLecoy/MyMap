# Data updates

- For each owner-approved data batch, update the tracked source files and GitHub CSVs, Supabase, and the deployed site together.
- City stays start a new counted visit when the next arrival is at least six calendar days after the previous departure. Keep actual periods and explicit half-day durations; gaps add no days.
- Country history remains independent and incomplete unless the owner requests a country update. Its grouping threshold remains 14 days.
- Use normal, focused checks for data-only batches: import validation, relevant data/database tests, a production build, and a brief live check. Run broader browser regressions when related UI changes or failures warrant them.
- Country reference figures and comparisons are stored in static CSVs. The three original metrics retain the workbook's cached values. GDP per capita, its index and country/continental medians are calculated offline using `docs/COUNTRY_METRIC_INDEX.md` model V1, as subsequently requested by the owner. Do not recalculate reference stats in the application; rebuild CSVs with `npm run country:prepare-reference`.
- Leave the Svalbard-only profile's reference figures unfilled: the supplied workbook combines Svalbard and Jan Mayen. Preserve that combined source row for future use without applying it to Svalbard.

# Important: city labels in country visit history

- **For every future country or city import, check whether city-name captions add useful information to that country's visit-history timeline.** Review city-states, very compact countries and cases where the city name repeats the country name. This also applies when the capital has a different name, such as Liechtenstein/Vaduz and Malta/Valletta.
- The current owner-selected exclusions are Singapore (SG), Monaco (MC), Vatican City (VA), San Marino (SM), Luxembourg (LU), Liechtenstein (LI) and Malta (MT). Preserve these choices when adding cities, refreshing records or rebuilding data.
- Keep the explicit policy in `COUNTRIES_WITHOUT_CITY_LABELS` in `src/components/CountryDetail.tsx` and its README description consistent. Check this case for new countries and record any new country-specific display decisions there.
- Do not suppress labels solely because only one city is currently in the catalog. Other countries can still benefit from naming that city.
- This policy hides only the city-name captions above country timeline segments. It does not delete city records, city-list navigation, maps, visit dates or statistics.
- Country visit captions adapt to the actual available width and loaded font. A visit known to contain the same single city in every stay shows that city above the month on the left. Other captions stay centered above their segment or point; prefer one timeline track, expand segments for one-line captions when space permits, and try stacked captions with readable compact segments before wrapping the timeline. Do not hard-code country-specific line counts. Keep each country's month columns and first markers aligned across visits, including visits with month-qualified dates. Use only the owner-approved `VISIT_CAPTION_SHORT_NAMES` dictionary for caption aliases; keep canonical city names unchanged.

# Visit history markers

- Preserve the owner-approved inclusive circles, half-day endpoints and one-day exceptional diamonds in [docs/VISIT_HISTORY_MARKERS.md](docs/VISIT_HISTORY_MARKERS.md). Singapore uses the diamond in both country and city timelines; Czechia uses it in the country timeline. Country endpoint overrides apply only to country timelines and exceptional durations. Keep other timeline styles and stored history unchanged when adjusting markers.
