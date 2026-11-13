The 323-entry collection is included as `cities.csv`, with the original 319 reviewed locations in `coordinates.csv` and coordinates for the two newly added cities in `cities.csv`. The latest uploaded original is preserved as `MyMap_Converted_Full.csv`; see [IMPORT_NOTES.md](IMPORT_NOTES.md) for normalization, matching decisions, and provenance. These collection files are tracked in Git so a fresh checkout runs the real data. The legacy optional `country-visits.csv` remains local. Demo records live separately in `fixtures/` and require an explicit demo command. Import diagnostics stay in `.cache/`, outside public assets. Imported city notes, visits, and links are included in the deployed site.

City history now uses `city-visit-history.csv` alongside `cities.csv`: 57 approved
cities, 111 stays, 249 days, including explicit half-day durations. Rome and
Vatican City extend the original collection to 323 entries. See
[city history format, source decisions and database import](../docs/city-history.md).

The Countries panel now reads the personal history in two tracked CSVs:

- `countries.csv`: one overview row for each of the 197 countries, with continent,
  membership in the 195-country set, visit status, first-visit order, optional
  reported totals, completeness, and notes.
- `country-visit-history.csv`: one row per visit. The 98 supplied first visits are
  recorded; unknown dates and durations stay blank.

`npm run data:import`, `npm run dev`, and `npm run build` validate both files and
create `src/generated/countries.json`. Duplicate records, impossible dates, and
conflicting complete totals stop the build with a useful error. No fictional
example visits are imported. The 98 confirmed countries have visited status
and first-visit order, while repeat-visit counts and days remain unknown.

Click the count at the right of the country filters to select 195 or 197
countries. The default is 195; `countrySet=197` in the URL preserves the other
view through details, city pages, reloads, and browser history. The 197 view
includes Kosovo and Taiwan. Honduras is #97 in the 195 view and #98 in the 197
view; Kosovo is #74 in the latter. Stored order and trip data do not change
when switching. Search and continent filters do not renumber visits.

The Countries panel splits the Americas into North America and South America.
South America contains Argentina, Bolivia, Brazil, Chile, Colombia, Ecuador,
Guyana, Paraguay, Peru, Suriname, Uruguay, and Venezuela (12 countries). The
remaining 23 countries, including Central America and the Caribbean, belong
to North America. The Cities panel retains its existing America classification.

Known country visits color the globe and update the footer (97 or 98 with the
current history). City visits stay independent; visiting a country does not
mark every city as visited. The existing Supabase city editor and saved map
statuses are unchanged. Country history is currently maintained through the
CSV files and imported during builds, not edited through the country page.

Selecting a country opens its detail page and frames its main landmass and
nearby islands on the globe. Its city rows sit beneath visit statistics and
visit history; city details retain the Countries tab and return to the parent
country. Country URLs use `?panel=countries&country=AL`; older `?country=AL`
links still work. Countries without city rows still have a country page.

Country dates retain their original year/month/day precision. Exact dates
calculate inclusive days when no duration was supplied. Reported totals remain
separate from partial visit details. Complete histories may calculate totals;
missing totals in incomplete histories display as “Not recorded”.

`countries.sample.json` now supplies only demo records and existing name aliases
or territory metadata. Existing Svalbard details and city records are retained
outside the 195/197 country counts. Fillable copies and examples are in
[templates/COUNTRY-VISITS.md](templates/COUNTRY-VISITS.md); update the tracked
input CSVs when more history is provided.

Country history now also uses `country-visit-periods.csv` for actual uninterrupted
stays within counted visits. The overview's RecordedVisits/RecordedDaysSpent
columns are checked against these stays. See [the current three-table format](templates/COUNTRY-VISITS.md)
and [database design](../docs/country-history.md).
