# Concise storage: exact behavior, one stored source per fact

The priority is exact reproduction of the current application. A smaller schema is accepted only when every existing public data field, editor workflow, history rule and UI behavior remains reproducible.

## Physical tables

The eight business tables live in `atlas_data`. Primary/foreign keys are necessary references, not duplicated descriptive data.

| Table                   | Stores                                                                                                                                                               | Derived instead of stored                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `countries`             | Country identity/classification, one city-display label override, membership, declared visit state/order, independent lifetime figures, completeness, notes/revision | City copies of country names/geography                |
| `cities`                | City identity/country reference, position, one map URL, map/visit state, notes/colour, genuinely independent fallback metadata/date                                  | Country name/geography, viewer URL, latest dated stay |
| `city_visits`           | Only `city_id, visit_number`, preserving identities and FK targets                                                                                                   | Arrival, departure and total duration                 |
| `city_visit_periods`    | Actual stay dates and exceptional duration overrides                                                                                                                 | Inclusive ordinary duration                           |
| `country_visits`        | Visit identity, notes and manual/partial-date/day overrides when no stay records supply them                                                                         | Bounds and duration of visits backed by actual stays  |
| `country_visit_periods` | Actual country stays, explicit duration exceptions, provenance/notes                                                                                                 | Parent visit summaries                                |
| `places`                | Area-specific metadata/outline, one map URL and editable state                                                                                                       | Viewer URL                                            |
| `place_countries`       | Country memberships and display order                                                                                                                                | Country names                                         |

Area geography is independent metadata: a place can span countries, so it is not blindly replaced by one country's values. Declared visited state remains distinct from the existence of detailed history; clearing dates does not silently erase the known visit. Supplied lifetime totals remain distinct from incomplete recorded history.

Public relations keep the original eight names as API views. They store no second copy. Their output columns, RPC JSON, editor permissions, pending-save revisions and bulk-import behavior are unchanged. Aggregate writes from existing clients are checked against final stay records using transaction-local intents, not persisted duplicate summaries. Country/city grouping remains fourteen/six days, respectively.

The six unused catalog/state views from the previous stage were removed. Existing tools were updated to insert missing rows and update reviewed fields without relying on `ON CONFLICT` against a view. Historical initial-schema DDL is skipped once concise storage is installed.

## Canonical files

- `cities.csv` stores city facts and independent visit-status/date overrides. It does not repeat country labels/classification, recorded totals or historical LastVisited.
- `reference/country-geography.csv` remains the owner's final workbook authority. `reference/country-labels.csv` contains eleven display/fallback exceptions, preserving UK/USA and Svalbard behavior without copying labels into every city.
- `coordinates.csv` remains active: its 319 reviewed positions do not overlap the 22 inline city positions. GeoNames provenance and attribution are retained.
- `city-visit-periods.csv` stores actual stays with `DaysSpentOverride` only when the inclusive date duration is wrong. Counted visits are generated in memory.
- `countries.csv` keeps membership and independent collection facts. Names/classification and recorded totals are joined/calculated.
- `country-visit-history.csv` keeps visit identities, notes and date/day overrides. Period-backed summaries are derived; the US undated visit remains intact.
- Country stay rows refer to CountryCode rather than repeating names. Country import templates contain headers, not old copies of the owner's visits.

The superseded initial conversion CSV, maintained counted-city-visit CSV and duplicate country-order reference were removed from the current tree. Git retains their history. Current authoritative workbooks, coordinate provenance and source ledgers still required by verified migrations/preparation are retained; they are not competing canonical tables.

`scripts/collection-inputs.ts` expands the established full exchange format in memory. Existing browser CSV downloads and legacy imports still work. Historical preparation commands finish by normalizing their output; they cannot leave maintained aggregate copies behind. Normalization restores inputs on failure and refuses to discard a legacy summary that contains information not reconstructible from stays.

```sh
npm run data:verify-sources      # reject duplicated canonical fields
npm run data:normalize           # normalize reviewed inputs; require exact parity
npm run architecture:verify -- --dry-run
npm run architecture:apply
npm run data:verify-live
npm run places:verify-live
```

## Verification

The source conversion was compared field-for-field against the pre-cleanup city/country snapshot. Every business value is identical. The real application build produces the same `index-B6FcNhDm.js` bundle hash as the pre-cleanup local build: no frontend behavior was rewritten.

PostgreSQL tests cover complete snapshot equality before/after migration, rollback/repeat application, removal of physical redundant columns, anonymous denial/editor saves, stale revisions, atomic status import, deferred city/country history edits, exact half-days, partial/unknown dates, unclassified fallback metadata, ordinary imports and shared-reference refreshes. The production rollback rehearsal also required exact equality of all public business snapshots before allowing installation.

The earlier 85 browser cases and 1,176 responsive checks establish the unchanged application baseline. The cleanup additionally runs the full unit suite, PostgreSQL migration checks, real build, live CSV agreement and post-deployment read-only profile audit. Periodic database-to-repository export and the future product features remain inactive.

For this cleanup, all **126 unit tests** passed, including the four complete PostgreSQL parity/edit/import scenarios. The live rollback rehearsal and committed migration both preserved business fingerprint `15f67b832452d0b7da06d18c83e0b107`. Real production editor city/place saves and atomic status import were then exercised inside a rolled-back transaction; anonymous reads succeeded and anonymous writes were denied. The post-rehearsal snapshot was identical. Live city/country, place and taxonomy verifiers also passed.
