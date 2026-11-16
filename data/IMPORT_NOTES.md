# Published collection

The canonical collection contains **361 cities**, **359 located cities**, **342 distinct city Google My Maps IDs**, and **11 places**. The superseded initial conversion export and maintained city-visit aggregate CSV have been removed; earlier versions remain in Git history.

- `cities.csv` stores stable city IDs, city names, country references, map status/link, 40 inline positions, and independent visit-status overrides.
- `coordinates.csv` supplies the other 319 reviewed positions and their GeoNames IDs. No city has the same position maintained in both files.
- `reference/country-geography.csv` is the owner's final country name/classification authority. `reference/country-labels.csv` holds only explicit display-name overrides and the Svalbard fallback.
- `city-visit-periods.csv` stores actual stays and exceptional duration overrides. Inclusive ordinary durations, counted-visit bounds/totals and LastVisited are derived from them.
- `countries.csv` stores country membership and independent collection facts. Country trip rows retain only independent/partial-date overrides and notes; known date/day summaries come from their stay periods.

`readCollectionCsv` reconstructs the established full import/exchange shape in memory. Browser CSV exports, standalone legacy CSV imports and current application behavior remain supported. `data:verify-sources` rejects reintroduced redundant fields; `data:normalize` normalizes reviewed files only after verifying exact business-data parity. Templates contain headers rather than obsolete copies of the owner's records.

## City/place map additions, 16 November 2026

The owner's `Nature,Name,Country,Status,Link` sheet is retained as `sources/city-place-map-additions-2026-11-16.csv`; the JSON alongside it records stable matches, GeoNames IDs, exclusions and boundary decisions. It adds 18 cities, updates the maps/statuses of San Antonio, Austin and Reykjavik, adds 10 places and attaches Patagonia's supplied map. Country rows and Interlaken are deliberately deferred for this batch. City/country stays, totals and existing coordinates remain unchanged. The owner subsequently confirmed **only San Antonio, Austin and Reykjavik in this sheet were visited**: keep their existing history and mark the other 18 cities `No` / `not-visited`, using the existing pin styles. Place visit flags remain for the owner to handle later. Map completion never implies a visit.

This sheet uses **displayed** status labels: `Complete` → stored `Complete`, `Usable` → stored `Update`, `Update` → stored `Unfinished`. The established full city exchange CSV continues to use stored status names. Do not reinterpret old CSVs using the sheet's display vocabulary.

**Future links:** accept `https://www.google.com/maps/d/u/0/edit?mid=ID&usp=sharing` automatically. `parseMapLink` validates the Google host/path and unique map ID, changes the path to the existing canonical `/maps/d/embed`, drops `usp`, and adds `ehbc=2E312F` for edit links unless explicitly provided. The viewer URL is derived as `/maps/d/viewer?mid=ID`. Existing embed/viewer/iframe inputs and their supported camera settings remain valid. Account-specific `/u/N/` is removed. Conversion does not publish a private map or change its sharing permissions.

Places also accept a single `Link`; the canonical CSV no longer stores a second viewer URL. Their diamond pins, labels, profiles, country membership and selection styling reuse Patagonia's implementation. A place without a verified boundary stores a SQL `NULL` outline, retains its pin/map/profile and focuses the camera on its representative point. Existing outlined places retain their previous selection behavior. Malformed non-null geometries remain errors.

The new sourced outlines are Bali province, Algarve/Faro district, the Santorini island group, **Komodo island only**, and a broad Cappadocia approximation. Komodo excludes the wider national park and its other islands. Cappadocia follows the owner's screenshot using a dissolved union of **Nevşehir, Aksaray, Niğde and Kayseri**; this is an explicitly approximate province-based interpretation rather than an exact Google boundary or an official historical-region boundary. All use Natural Earth 5.1.2 public-domain data. `sources/city-place-outlines-2026-11-16.json` pins source URLs, checksums, exact selection and geometry hashes. `NODE_USE_ENV_PROXY=1 npx tsx scripts/prepare-map-batch-outlines.ts --check` verifies reproduction.

**Pending boundaries:** Torres del Paine, Fuji, Izu, Lake Atitlan and Atacama. All have representative pins and supplied maps. The owner confirmed Fuji means both Mount Fuji and Fuji Five Lakes, and Atacama means the desert destinations around **San Pedro de Atacama**. Fuji's pin is at the summit and Atacama's at San Pedro; a broad Atacama Desert or administrative-region outline would not reproduce the requested scope. Izu points at the peninsula. The environment cannot access Google map contents or OpenStreetMap boundary endpoints, and no unverifiable regional boundary was invented.

`npx tsx scripts/city-place-map-batch.ts` prepares the scoped SQL without live writes. `--dry-run` rehearses against Supabase and rolls back; `--apply` commits; `--verify` checks every city/country business field plus all places. The transaction guards existing map state, preserves unrelated edits and all history, verifies exact approved rows and supports repeat application without revision changes. Deploy the nullable-outline reader before applying the new records, so older frontend code is never the deployed reader of pending outlines.

Validation for this batch: all 130 unit tests passed, including rollback/repeat/conflicting-edit PostgreSQL scenarios and geographic inclusion/exclusion checks. The production build, source normalization, final country taxonomy and five new source-outline reproductions passed. Six focused browser cases covered all 32 supplied city/place profiles at 320/601/1440px, lazy embeds, Patagonia's embed/viewer links, real globe selection and unchanged 9px city targets; the authenticated place save/revision regression also passed. The scoped import was rehearsed against the live database with rollback before publication.

After publication, all 64 read-only production profile checks at 320/1440px passed with no JavaScript or transport errors and one shared live snapshot request. Live city/country, geography and all-place verifiers matched the repository; recorded visits/days stayed unchanged. Place verification compares records by stable ID because the RPC's display-name order can differ from the source sheet's order.

## Reviewed matching decisions

- **Iguazu and Lofoten remain unplaced**, as requested. They remain searchable and their My Maps links work independently of the globe position. Their two missing-location import warnings are intentional.
- **Longyearbyen uses Svalbard (SJ)** and **Sevastopol uses Ukraine (UA)**, following the GeoNames country codes with the user's approval.
- **Krong Siem Reap** uses the Siem Reap city coordinates; its supplied display name is retained.
- Same-country names with multiple candidates use the clearly dominant main city where its population is at least 50,000 and ten times the next candidate. Eighteen entries use this rule; the other matches use unique primary/alternate names or the reviewed Siem Reap alias.
- Short country names such as Bosnia, Brunei, St. Lucia, Timor Leste, and Syria receive explicit ISO country codes. Their display names remain as supplied.

## Coordinates and attribution

`coordinates.csv` records the GeoNames ID beside every coordinate pair. Coordinates come from GeoNames cities500, distributed by geonamescache 3.0.2, under CC BY 4.0. The app displays GeoNames attribution. Current source paths, import totals and GeoNames dataset attribution are recorded in `collection-info.json`.

## Runtime and verification

Normal `npm run dev` and `npm run build` use this collection. Demo fixtures are available only through explicit demo commands and are not included in the normal collection. Saved real-collection map statuses are kept separately from saved demo statuses.

Run `npm test`, `npm run build`, and `npm run test:browser` to verify this collection. The browser configuration selects the real-collection suite for a normal build, or the existing five-city suite after an explicit `npm run build:demo`.

Google map URLs and viewer navigation are checked, including Nice and Vienna's distinct IDs. Live Google content and sharing permissions require a browser with Google access; the managed cloud environment blocks that host, so automated viewer checks mock only the external iframe response.
