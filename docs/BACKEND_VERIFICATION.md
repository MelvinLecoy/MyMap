# Backend refinement verification

Baseline: `f4f7a0abd0242aa098bea8095c3d8b0219b7cdb5`. Scope and ownership decisions are in [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md).

The intended data change is the owner's replacement country/city hierarchy. No future feature or periodic repository writeback has been enabled.

## Completed pre-release checks

| Check                                                 | Result                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Full unit suite                                       | 122 passed                                                                                                           |
| Database/authentication browser suite                 | 37 passed                                                                                                            |
| Existing collection/map/browser suite                 | All 48 cases passed, including two isolated reruns                                                                   |
| Responsive hierarchy/profile audit                    | 1,176 checks passed at 320, 390, 601 and 1440px; all 198 country and 343 city profiles checked at both 320 and 601px |
| Real production build / TypeScript                    | Passed                                                                                                               |
| Explicit demo build                                   | Passed; real build restored afterward                                                                                |
| Workbook reproducibility and whitespace/format checks | Passed                                                                                                               |
| Live city/country CSV agreement                       | Exact match, no issues                                                                                               |
| Live places/associations/outline agreement            | Exact match                                                                                                          |
| Remaining live taxonomy changes                       | Zero                                                                                                                 |

The two collection reruns covered a temporary preview-server response failure while a build replaced its output and a software-rendered map startup timeout. Both passed in isolation against the completed build; no application assertion was removed or relaxed. Five old cloud assertions were corrected to check current progress counts, the existing three-cell country scoreboard and the established timeline markup/order. They were rerun in the complete 37-test cloud suite.

The final demo-build check also exposed an existing reference-coverage mismatch: the demo's smaller country collection was being used to validate the full published reference catalog. Reference validation now uses the complete static catalog, keeping reference coverage independent of the demo's travel records.

## Record-preservation evidence

The archived workbook is byte-identical to the uploaded original, SHA-256 `962a968a34e7030d0a8cd795841b6d09196d265a7083b092df210dd2e9c12f2a`. It supplies 197 unique country codes. The 198th profile, Svalbard, remains an explicit fallback.

A field-by-field comparison against the baseline city CSV confirmed the same 343 rows in the same order. Exactly 175 rows changed, and only `Continent`, `Region` and `SubRegion` values changed. Every other CSV field was preserved.

The live architecture migration was rehearsed with rollback and then committed under a guard requiring exact equality of the complete legacy business snapshots. Its before/after business fingerprint was `e4976e83b58e58db17b569c650c5f459`. The new unified RPC was required to equal the three existing readers plus version 1. The private migration ledger records the installed SQL checksum; it does not falsely register historical manual migrations.

The separate geography transaction locked and compared all eight public business tables, updated only the approved city geography fields, and rejected changes to any other city field, history record, country, place or association. Revision timestamps change appropriately for changed city records. A fresh read reported 175 changes applied and zero remaining.

After both live changes, verified totals remained:

| Entity / measure                              |             Value |
| --------------------------------------------- | ----------------: |
| Cities / visited cities                       |         343 / 174 |
| City visits / actual stays / recorded days    |   222 / 235 / 401 |
| Country profiles                              |               198 |
| Country visits / actual stays / recorded days | 127 / 140 / 314.5 |
| Places / country associations                 |             1 / 2 |

## Behavior and failure-path coverage

SQL tests exercise migration idempotency, checksum drift refusal, transactional rollback, unchanged legacy APIs, anonymous read-only access, invoker-view RLS, editor permissions and deferred city/country references. Geography tests cover deliberate blanks, exact source matching, Svalbard, strict import coverage and safe unmapped runtime records.

Runtime tests exercise coalesced reads, unsupported/invalid snapshot rejection, narrowly limited legacy fallback, fresh reads without TTL caching, revision-only refreshes and an old in-flight response completing after a fresh post-save read. Browser cases cover normal and stale city/place saves, failed requests, import atomicity, sign-in/out, cross-tab/device behavior, password recovery, anonymous readers, cold-start/outage fallback and database metadata that must not override the authoritative hierarchy.

The existing collection suite retains its checks for search, filters, sorting, country sets, scoreboards, routes, map/pin priority, touch behavior, lazy viewer navigation and the full approved timeline presentation, including half-days, diamonds, capsules, dashes, row heights and caption layout.

## Production release checks

After deploying the committed application, verify the exact production commit/alias and run a public, read-only browser audit against the deployed HTML/assets and real Supabase endpoint. Check authoritative country/city hierarchy, statistics, country-header alignment, narrow-screen overflow, JavaScript errors, use of the unified reader and absence of legacy read requests. Reject write/auth requests during that audit.

Repeat `data:verify-live`, `places:verify-live` and `country:verify-geography-live` if any further data changes occur during release. The application and local browser suites do not claim to validate the contents of externally hosted Google maps; they validate canonical URLs and navigation, with external-provider fixtures where documented.
