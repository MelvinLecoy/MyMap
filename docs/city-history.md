# City visit history

The approved city history contains **57 cities, 111 stays and 249.5 days**. Each
screenshot entry remains a separate city stay. Southampton and Reykjavík are
excluded. Rome and Vatican City were absent from the original collection and
are added without invented map links; the collection now has 323 cities.

`data/city-visit-history.csv` stores CityId, Cities, CountryCode, VisitNumber,
ArrivalDate, DepartureDate and DaysSpent. VisitNumber runs chronologically from
1 within each city. `data/cities.csv` retains the city metadata and includes
Visited, LastVisited, RecordedVisits and RecordedDaysSpent. Builds validate
those summaries against the history. LastVisited is the latest departure date.

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
including the midnight-related exceptions approved by the owner. The baseline transcription and approval ledger are tracked in
`data/sources/city-screenshot-transcription.json` and `city-visit-decisions.json`.
`npm run city:prepare-data` reproduces both city CSVs from those sources. This
is a source preparation command, not a synchronization from the live database.

`public.city_visits` has a composite primary key (city_id, visit_number), a
foreign key to cities, exact date bounds, and a numeric duration constrained to
positive half-days within the date span. Deferred constraints reject overlapping
or incorrectly numbered histories. History writes synchronize the parent city's
visit status and latest date without changing map status, notes, links, or pin
color. Once history exists, conflicting direct summary edits are rejected.
Deleting the final history entry clears the latest date but retains the known
visited status. The country grouping rule does not apply to these city entries.

Public visitors can read history. Only the existing atlas editor can write it.
`atlas_city_snapshot()` returns cities and stays in one database statement. The
website refreshes that snapshot and retains history through map status saves,
imports, outages and reloads. City details show visit totals and individual
stays; Export offers separate city and city-history CSV downloads. Browser
editing of visit dates/durations is not introduced by this import.

`npm run city:prepare` writes `.cache/city-history-ready.sql`.
`npm run city:verify-live` runs the migration and import in a transaction that
rolls back. `npm run city:apply` commits it. Both require the existing configured
Supabase project and management credential. Only the 57 approved cities' visit
fields are updated; all other city fields/rows are checked for preservation.
An existing conflicting history stops the import. Repeating an identical import
does not alter timestamps. Country tables and their complete snapshot are
compared inside the transaction and must remain identical.

This change does not propagate city dates or durations into country history.
The subsequent four-city owner corrections have a separate guarded migration,
`202611130004_city_visit_owner_corrections.sql`, which must be applied to the live
Supabase database in addition to deploying the updated CSV bundle.
The owner's subsequent country-specific corrections are applied separately by
`history:apply-updates`; see [duration updates](duration-updates.md).

The Cities panel shows visit totals and map progress for the current search and
filters. Progress chips share the map-status filter used by the globe. City rows
show visit count, latest month/year, days spent and map status without increasing
the 72px row height. Map status saves retain all visit history.
