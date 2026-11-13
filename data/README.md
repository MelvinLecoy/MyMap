The published 321-entry collection is included as `cities.csv`, with reviewed locations in `coordinates.csv`. The latest uploaded original is preserved as `MyMap_Converted_Full.csv`; see [IMPORT_NOTES.md](IMPORT_NOTES.md) for normalization, matching decisions, and provenance. These collection files are tracked in Git so a fresh checkout runs the real data. Optional `country-visits.csv` remains local. Demo records live separately in `fixtures/` and require an explicit demo command. Import diagnostics stay in `.cache/`, outside public assets. Imported city notes, visits, and links are included in the deployed site.

`countries.sample.json` supplies the new Countries panel's starter records. The
131 country names, codes, and continents are seeded from the city collection;
their temporary visit values are `unknown` (shown as Not Yet). Replace or extend
the `countries` array when the actual country data is ready. Keep each `code`
stable to associate it with the existing cities. Supported visit values are
`unknown`, `not-visited`, `planned`, and `visited`.

City counts are calculated from the current city data, including database updates.
Clicking a country opens its cities. Country records are currently read-only
starter data; the existing Supabase city editor and real travel totals continue
to use the existing atlas data. Set `sample` to `false` after replacing the starter
records to remove the sample notice.

Selecting a country opens its own detail page and frames its boundary on the
globe. Its city rows sit beneath the visit statistics and visit history; city
details retain the Countries tab and return to the parent country. Country
URLs use `?panel=countries&country=AL`; older `?country=AL` links still work.

Country seed records may also supply `firstVisitOrder`, `timesVisited`,
`totalDaysSpent`, `notes`, and a `visits` array with `number`, `arrival`,
`departure`, `daysSpent`, and optional `notes`. Missing values display as
“Not recorded”; a partial trip list is not used to guess all-time totals.
Arrival and departure accept the same year/month/day precision as city visit
dates. The personal CSV templates in `templates/` remain separate input files;
this display change does not import them into the website.
