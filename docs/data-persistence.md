# CSV, database and restart consistency

The authoritative approved data is tracked in Git: `data/cities.csv`,
`city-visit-history.csv`, `city-visit-periods.csv`, `countries.csv`, `country-visit-history.csv` and
`country-visit-periods.csv`. The city source ledgers reproduce 90 visited cities,
137 counted visits, 150 stays and 305.5 city-days. Prior corrections and approved
batches are preserved. Country history remains incomplete and unchanged at 273.5
recorded country-days.

The website uses Supabase as its saved runtime data. A code deployment does not
apply a SQL migration. Consequently, a new CSV bundle can briefly show the new
data and then be replaced by an older successful database response if the
approved data migrations have not been applied. This was the mismatch corrected
here: Git contained 124 city stays, while Supabase still contained 111.

`npm run data:verify-sync` exercises any needed legacy city patches, the six-day grouping migration and the complete
CSV equality checks in a transaction, then rolls everything back.
`npm run data:sync-approved` commits that same transaction. Legacy histories
receive the guarded four-city correction and 12-city additions before their actual
stays move into `city_visit_periods` under the recalculated `city_visits`. Histories
already using periods skip those historical patches. An empty city
history is rebuilt from the current approved CSVs. Country history is compared
before and after and must remain byte-for-byte equal as JSON. Unrecognized
edits, extra records or differing business fields cause a rollback; they are
never silently discarded.

`npm run data:verify-live` reads fresh city and country snapshots and compares
all CSV business fields, including locations, map links, statuses, notes,
visit dates and durations. It checks city-to-country references, recorded
counts/totals, all six tables, stay durations, numbering, six-day city grouping and
parent summaries. Country grouping remains 14 days. City visits sum their actual
period durations, excluding gaps, and preserve explicit half-days. Database revision
timestamps are independent of the CSV fields. The full operator report is
written to `.cache/data-integrity-report.json`.

Before releasing future approved data, regenerate the CSVs from their source
ledgers, run the import and relevant tests, verify/synchronize the database,
and require `data:verify-live` to pass. Commit the source ledger, CSVs and any
new reviewed data migration together. A database edit made directly through the
website is persistent in Supabase; export and review it into the tracked CSVs
before a subsequent synchronization so the fallback remains current too.

Every real build runs `data:import` and recreates `src/generated/atlas.json`
and `countries.json` from the tracked CSVs. Generated files are build artifacts,
not another maintained source. Fresh browser sessions and page reloads read the
database again. During a database outage, the current built CSV snapshot remains
browsable; country and city history are not reconstructed from a browser's
temporary state. Tests cover a new anonymous read, repeat synchronization,
empty-history restoration, reload and cold-start database failure.

For a fresh database, provision the base city schema/collection first, then run
the existing country and city import commands. The current CSV seeds already
contain the approved additions. The synchronization command operates on that
initialized atlas and is also safe to repeat after a normal website restart.

Every owner-approved data batch updates GitHub CSVs, Supabase and the deployed
site together. Data-only updates use focused import/database checks, a build
and a brief live check; broader browser regressions are reserved for related UI
changes or failures. New batches are recorded in `data/sources/city-visit-batches.json`.
