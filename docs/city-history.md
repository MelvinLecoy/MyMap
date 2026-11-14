# City visit history

The approved city history contains **90 cities, 137 counted visits, 150 actual stays
and 305.5 summed city-days**. Southampton and Reykjavík are excluded. Rome,
Vatican City, Austin, San Antonio, Niagara Falls and Detroit extend the collection to 327 cities.

A new city visit starts when the next arrival is **at least six calendar days after
the previous departure**. A shorter gap joins the same visit. Measure each gap
from the immediately preceding stay's departure, using exact dates in UTC. The
actual stays remain separate and gaps never add days. For example, Singapore's
18–20 and 25 August 2026 stays are one visit with four days, while the 3 September
stay starts another visit. This city rule does not change the country threshold
of 14 days or any country history.

Three tracked CSVs are required to preserve the full city history:

- `data/cities.csv`: metadata, Visited, LastVisited, RecordedVisits and RecordedDaysSpent.
- `data/city-visit-history.csv`: one counted visit per row, with CityId, Cities,
  CountryCode, VisitNumber, ArrivalDate, DepartureDate and DaysSpent. Bounds
  enclose the actual periods; DaysSpent sums only their explicit durations.
- `data/city-visit-periods.csv`: one actual stay per row, with the same identifiers,
  VisitNumber, PeriodNumber, ArrivalDate, DepartureDate and explicit DaysSpent.

VisitNumber starts at 1 per city; PeriodNumber starts at 1 per counted visit.
Builds validate the six-day grouping, numbering, bounds, duration sums and city
summaries. LastVisited remains the latest actual departure.

DaysSpent is explicit and supports increments of 0.5. It is never rounded or
recalculated from the inclusive date span. The explicit duration corrections retain
the screenshot's date bounds: London 1–3 May 2026 (2.5), Seoul 17–20 July 2025
(3.5), Auckland 5–8 August 2025 (3.5), Singapore 11–12 September 2026 (1 day),
and Shanghai 30–31 August 2026 (1.5).
The owner did not specify which date was partial, so no time or daily allocation
is invented. Auckland's separate 28 July stay remains one day.

The three corrected starts are Prague 5 May 2024 (two days), Panama City
24 March 2025 (one day), and Boston 20 August 2021 (one day). Later owner
corrections adjust Los Angeles 30 January–2 February 2022 (3.5 days), Orlando
1–6 March 2022 (5.5 days), Boston 26–28 June 2022 (2.5 days), and San Francisco
1–2 November 2025 (2 days). All other screenshot entries are preserved,
including the midnight-related exceptions approved by the owner. A subsequent 13 stays supplied for Seattle, Dallas (two stays),
Denver, Austin, San Antonio, San Diego, Tijuana, Baltimore, Ottawa, Montego Bay,
Santo Domingo and San Pedro Sula adds 12 newly visited cities and 16 summed
city-days. The baseline transcription and approval ledger are tracked in
`data/sources/city-screenshot-transcription.json` and `city-visit-decisions.json`.
`npm run city:prepare-data` reproduces all three city CSVs from those sources,
including `additionalVisits` in the approved decision ledger. This
is a source preparation command, not a synchronization from the live database.

`public.city_visits` stores counted visits with primary key (city_id,
visit_number). `public.city_visit_periods` stores their actual stays with primary
key (city_id, visit_number, period_number) and a cascading foreign key to the visit.
Both constrain exact dates and positive half-day durations. Deferred constraints
require each visit to match its periods' bounds and summed days, consecutive
numbering, non-overlapping stays, gaps under six days inside a visit and gaps of
six days or more between visits. History writes synchronize only the parent
city's visit status and latest date. Conflicting direct summary edits are rejected.
Deleting the final visit clears the latest date but retains known visited status.

`202611140002_city_visit_periods.sql` converts legacy stay rows atomically and
idempotently. It proves that every original stay, city metadata field, revision
and the complete country snapshot are preserved. Prior city patches run before
this conversion when necessary; historical patch commands reject the grouped
schema and direct operators to `data:sync-approved`.

Public visitors can read history. Only the existing atlas editor can write it.
`atlas_city_snapshot()` returns cities, counted visits and actual periods in one database statement. The
website refreshes that snapshot and retains history through map status saves,
imports, outages and reloads. City details show visit totals and each actual stay under its counted visit, without
a redundant enclosing range. Export offers city, counted-visit and actual-period
CSV downloads. Browser
editing of visit dates/durations is not introduced by this import.

`npm run city:prepare` writes `.cache/city-history-ready.sql`.
`npm run city:verify-live` runs the migration and import in a transaction that
rolls back. `npm run city:apply` commits it. Both require the existing configured
Supabase project and management credential. Only approved cities' visit
fields are updated; all other city fields/rows are checked for preservation.
An existing conflicting history stops the import. Repeating an identical import
does not alter timestamps. Country tables and their complete snapshot are
compared inside the transaction and must remain identical.

This change does not propagate city dates or durations into country history.
Use `npm run data:verify-sync` to rehearse the complete current synchronization
and roll it back, then `npm run data:sync-approved` to commit. Both apply any
needed legacy patches before the grouping migration and require exact agreement
with all six canonical CSV tables. `npm run data:verify-live` verifies a fresh
snapshot. These commands preserve country history and reject unexported edits.
Older correction/addition/duration commands are retained for historical
migrations only and must not be applied after city grouping.

The Cities panel shows visit totals and map progress for the current search and
filters. Progress chips share the map-status filter used by the globe. City rows
show visit count, latest month/year, days spent and map status without increasing
the 72px row height. Map status saves retain all visit history.

## Expanded verified city batch

The owner-verified `expanded_cities_visit_data_verified.xlsx` is retained in
`data/sources/`, alongside its transcription and source hash in
`city-visit-batches.json`. Its two sheets describe the same 26 stays across 21
cities; they are imported once. These add 40 city-days and 25 counted visits.
Tashkent's stays on 21 and 24 May 2026 share one visit. Nadi (4–5 August 2025)
and San José (6–7 April 2025) each retain their explicit 1.5-day duration.

Duration-only entries use `departure = arrival + ceil(days) - 1`; two days cover
the start date and the following day, while 0.5 days cover the start date only.
Explicit departure dates take precedence. Commas separate actual stays, which
are then grouped using the existing six-day rule. Siem Reap and Tromsø reuse
the existing Krong Siem Reap and Tromso records. Niagara Falls (US) and Detroit
receive new city records with GeoNames coordinates and no invented map links.

`python scripts/prepare-expanded-city-batch.py` rebuilds this workbook's
transcription (requires openpyxl). `npm run city:prepare-data` then regenerates
all three CSVs from the original sources plus the approved batches. Histories
for the same city merge chronologically; a later approved batch replaces an
older entry with the same arrival date. Each batch update must reach GitHub
CSVs, Supabase and the deployed website together. Use the focused data checks,
build and brief live verification described in AGENTS.md.
