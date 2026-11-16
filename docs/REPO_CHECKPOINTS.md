# Future database-to-repository checkpoints

**Status: design only. Periodic writeback is not implemented or activated.**
There is no checkpoint exporter, scheduled workflow, automatic commit or pull-request
job in this change. The owner wants to introduce periodic database-to-repository
writeback later. Do not activate it as a side effect of database maintenance or a
deployment.

This document records the contract that a future implementation must satisfy.
See [data-persistence.md](data-persistence.md) for the existing guarded import and
verification commands. Those commands are not a database export mechanism.

## Ownership and direction

Reference data is owned by the repository: identity, country classification,
geography, boundaries, source provenance and precomputed reference figures. Builds
turn the approved CSVs into immutable rendering artifacts. In particular, the
owner-supplied country categorization workbook is authoritative; a checkpoint must
never replace its classifications with an older database value.

Editable collection state is owned by the database after a successful authenticated
save. Its repository snapshot provides a reviewed checkpoint and the initial/offline
rendering fallback. A deployment must not reset a saved value to an older fallback.

Raw uploaded workbooks and approved source ledgers remain provenance. They are not
targets for automatic writeback. Historical preparation scripts must not silently
recreate older collection state over a newer reviewed checkpoint. A future exporter
must record which source revision it started from so those conflicts can be detected.

Canonical source files now omit derived fields; [CONCISE_STORAGE.md](CONCISE_STORAGE.md) defines the stored facts and overrides. Until a separate snapshot format has
been introduced, a compatibility download can join repository reference fields with
database editable fields by stable ID. It must not copy the database's full city,
country or place row over the repository reference data.

## Complete, consistent capture

Use one database transaction/snapshot for all collection entities. The versioned
`atlas_collection_snapshot()` contract is intended to provide:

```text
{
  version: 1,
  cities: { cities: [...], visits: [...], periods: [...] },
  countries: { countries: [...], visits: [...], periods: [...] },
  places: [...]
}
```

The nested shapes retain the existing `atlas_city_snapshot()`,
`atlas_country_snapshot()` and `atlas_places_snapshot()` contracts. Read the
snapshot version explicitly; reject unsupported versions instead of making a
best-effort export.

A future export must include actual stays, notes, explicit half-days, unknown
country dates/totals, country history completeness, map links/status and pin colors.
Cities and countries keep independent histories. City grouping remains six days;
country grouping remains 14 days. Gaps contribute no visit days. Place records and
their country associations must be included without counting them as cities.

Operational timestamps are not business fields in the CSVs. Keep them, or a
collection revision, in a private capture manifest for concurrency and provenance.
Do not manufacture a fresh database revision merely because a checkpoint ran.

## Proposed output allowlist

The following are candidate compatibility snapshot outputs, not an active job:

- `data/cities.csv`
- `data/city-visit-periods.csv`
- `data/countries.csv`
- `data/country-visit-history.csv`
- `data/country-visit-periods.csv`
- `data/places.csv`
- `data/place-countries.csv`

Before implementing this list, reconcile it with the final static/editable file
split. New reference catalogs, metrics, medians, highlights, classification CSVs,
coordinate provenance, source ledgers, uploaded workbooks and bundled GeoJSON files
must not be rewritten by the job. A new editable field needs an explicit export
decision and a round-trip serializer before activation.

Current browser downloads cover cities and their two history files only. They are
not a complete collection checkpoint and must not be presented as one.

## Validation and conflict handling

The future tool should default to a read-only plan. Writing must require an
explicit mode, and creating a Git commit or PR should be a separate operator/job
step. The exporter never writes to the source database.

Before any replacement:

1. Record the source commit, hashes of every input/output/reference dependency and
   the captured database snapshot/revision. Refuse an unrecognized local edit or
   existing unfinished checkpoint.
2. Validate IDs, duplicates, foreign keys, country membership, visit numbering,
   grouping, durations, date precision, coordinates and place geometry references.
   Missing and extra entities require a supported migration, not silent omission.
3. Serialize every output to a staging directory with deterministic headers,
   ordering, quoting, Unicode and line endings. Preserve IDs, notes/newlines and
   explicit `0.5` increments exactly; distinguish unknown values from zero.
4. Re-import the entire staged set using the production importers and compare
   semantic business fields with the captured state. Verify reference fields are
   unchanged and all entity relationships survived.
5. Recheck repository hashes and the database revision/content hash before
   materializing the candidate. If either changed, stop and produce a new plan.
6. Replace files through a recoverable staged transaction or perform the work in
   an isolated checkout. Any failure must prevent a partial set of CSVs from being
   committed. A recovery journal must refuse to overwrite subsequent user edits.
7. Rebuild/import once more and confirm a second export produces no changes.

Changes made to the database after a consistent capture belong to the next
checkpoint. Never claim that a checkpoint is the latest database state without
checking its revision. Never resolve a repository/database conflict by silently
choosing whichever file or table was read last.

## Territory and future-feature constraints

The existing overview has 197 CSV rows while the importer appends Svalbard from
the starter metadata, producing 198 runtime entities. Svalbard's `is195` value is
undefined/null, which excludes it from both existing country sets. The current
overview importer accepts only `Is195=0` or `1`. A naive 198-row export therefore
does not round-trip correctly.

Before activation, either extend the catalog/snapshot format to represent territory
membership explicitly or reject any changed omitted territory with an actionable
error. Never drop Svalbard's state, count it in the 197-country set, or substitute
the workbook's combined Svalbard/Jan Mayen reference figures for Svalbard alone.

Other future features also need explicit ownership before exporting them:

- Country/territory administration relationships belong in a reference relation;
  account for multiple relevant sovereign/administrative relationships.
- Favorites are independent from visit history, travel intent and map progress.
- Planned/want intent must not erase past visits or their counted durations.
- Places can associate with multiple cities and countries; association tables need
  stable IDs and complete export coverage.
- Visa state and map-creation state belong to editable collection context, not the
  static country classification or existing map-progress enum.

These features are design constraints, not implemented user-facing features here.

## Credentials, publication and review

A future scheduled/manual runner must use a server-side credential with the minimum
read access required for one consistent snapshot. Never put a management token,
service-role credential or GitHub write token into `VITE_*`, browser code, CSVs,
commit messages or logs. A browser publishable key is not an authorization mechanism
for repository writeback.

The repository and deployed CSV snapshots are public-facing data. Only include
fields explicitly approved for publication. Authentication records, editor lists,
emails, tokens, password/session material and private future visa/passport details
must stay outside the checkpoint. Notes require the same publication decision as
any other exported field.

When activated later, a scheduled/manual workflow should open or update a reviewed
pull request containing only allowed snapshot files and a concise validation
manifest. It must not auto-merge, push directly over an unrelated branch update,
send notifications or modify the production database. No-change captures should
create neither commits nor pull requests.

## Existing place metadata refresh

`scripts/sync-places.ts` now seeds editable fields only when a place is first
inserted. Later reference refreshes update identity/geography, outline/source and
country associations while preserving saved map links, map/visit status, last visit,
notes and pin color. An unchanged reference refresh does not touch the place row's
revision timestamp.

`places:apply` verifies reference fields after applying the refresh.
`places:verify-live` remains a strict comparison with the full repository snapshot
and reports saved-state drift for review. Neither command exports database state
or activates periodic writeback.
