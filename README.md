# Elsewhere — a personal travel atlas

A responsive, static travel globe inspired by the supplied reference: an airy Coastal palette with off-white panels, pale blue water, light neutral land, mint visited countries, and mint actions with dark text, plus city pins, a searchable collection, and focused city details. The map and city panel fill the browser window, with no outer header, navigation, footer, or page margins. Built with React, TypeScript, Vite, and MapLibre GL JS. The static CSV version runs without a backend. Optional Supabase integration adds owner sign-in and persistent status saves across devices; see [docs/supabase.md](docs/supabase.md).

The repository includes the reviewed **321-entry collection**, its latest uploaded source CSV, and **319 matched locations**. All visits start as **Not Yet**. Iguazu and Lofoten are intentionally unplaced. See [data/IMPORT_NOTES.md](data/IMPORT_NOTES.md) for matching decisions and provenance.

## Run on a Mac

Tested with **Node 24.22.1** and npm 11.9.0. Use Node 22.12 or newer; `.nvmrc` pins the tested version.

```sh
cd MyMap
nvm install                 # optional, if you use nvm
nvm use
npm ci
npm run dev
```

Open the address Vite prints (normally `http://localhost:5173`). The dev command imports the included `data/cities.csv` and `data/coordinates.csv` before starting. Missing collection data produces an error instead of silently loading sample records. Restart the dev command after changing CSV inputs. Dependencies and versions are pinned in `package-lock.json`.

Five-city fixtures remain in `fixtures/` for explicit demo builds and regression tests. They are not used by normal development or production builds.

## Commands

| Command                            | Purpose                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                      | Import the included collection and start Vite                     |
| `npm run data:import`              | Validate and import your real CSV                                 |
| `npm run data:import -- --demo`    | Import the sample explicitly                                      |
| `npm run data:resolve-coordinates` | Optional offline GeoNames matching                                |
| `npm run atlas:prepare`            | Download, verify, simplify, and regenerate the bundled atlas      |
| `npm run fonts:prepare`            | Optional: regenerate bundled glyphs from included font sources    |
| `npm run typecheck`                | Check application, import scripts, and tests                      |
| `npm test`                         | Run collection, import, coordinate, typography, and storage tests |
| `npm run build`                    | Import real data, type check, and produce `dist/`                 |
| `npm run build:demo`               | Explicitly build the five-city regression fixture into `dist/`    |
| `npm run preview`                  | Serve the last production build                                   |
| `npm run test:browser`             | Browser smoke tests against the last build                        |

`npm run build` deliberately fails with an actionable message if `data/cities.csv` is missing. It will never silently publish the sample in place of your data. `build:demo` is the explicit alternative.

## Add your collection

Without Supabase configured, the city-detail page has an editable **Map status** dropdown. Changes immediately update the list, its status filter, and other open tabs. They are saved in this browser for this site and survive refreshes; they do not sync across devices or change the source CSV or GitHub. Clearing this site's browser storage restores the imported statuses. If the browser cannot save a change, it stays active for the current session and the page reports that it could not be saved.

The ready-to-run **`data/cities.csv`** and **`data/coordinates.csv`** are tracked in Git. The latest uploaded original is preserved in `data/MyMap_Converted_Full.csv`; runtime normalization and approved country-code choices are documented in `data/IMPORT_NOTES.md`. To replace or extend the collection, update the prepared UTF-8 `data/cities.csv`. Keep these headers (case and surrounding whitespace do not matter; `City` is accepted as an alias for `Cities`):

```csv
Cities,Country,Continent,Region,SubRegion,Status,Link
```

Optional columns:

```text
Latitude,Longitude,CityId,CountryCode,Visited,LastVisited,PinColor,Notes
```

- **Status**: `Complete`, `Update`, `Unfinished`, or `Not Started`. Case and whitespace are normalized; legacy `Done` becomes `Complete`. Missing/unknown statuses stop import with the row number.
- **Visited**: `Yes`, `No`, `Planned`, or blank (case-insensitive). The city list uses labeled check, calendar, and dashed-circle markers for **Visited**, **Planned**, and **Not Yet**, independently of the map-status badge on the right. `No` and blank both display as Not Yet in the list; blank remains unknown in the imported data, and never implies a plan. Only `Yes` (or a valid inferred visit) counts toward visited totals. The demo marks Helsinki as Planned.
- **LastVisited**: `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`. A valid date implies a visit when `Visited` is blank. A valid date paired with `No` or `Planned` produces a warning and an unknown visit (the contradictory date is withheld until corrected). Malformed dates warn and are omitted. The city list shows the last-visit year for visited cities; details show the full date without timezone shifts.
- **PinColor**: optional `#RRGGBB`; invalid values warn and fall back. The default is amber for visited, filled neutral for not visited, or an outlined dark pin for an unrecorded visit. A separate halo shows selection.
- **Notes**: plain text, including quoted multiline cells. HTML remains text.
- **Latitude / Longitude**: valid city-center coordinates; zeros are valid. GeoJSON uses `[longitude, latitude]`. An incomplete/invalid pair warns. Missing coordinates keep the city in the list with a location label.
- **CityId**: optional stable letters/numbers/hyphens/underscores, including Unicode. Otherwise a deterministic city-and-country slug is generated (`Kyiv,Ukraine` → `kyiv-ukraine`). Accents are folded; non-Latin names remain usable. Row reordering never changes IDs. Duplicate resulting IDs stop import; assign explicit IDs to disambiguate same-name cities in one country.
- **CountryCode**: optional ISO 3166-1 alpha-2. Otherwise country names resolve locally with `i18n-iso-countries`. Aliases include Russia, Czechia/Czech Republic, Turkey/Türkiye, UK, USA, South/North Korea, Taiwan, Ivory Coast, Bolivia, Iran, Moldova, Tanzania, Venezuela, Laos, and Palestine. Kosovo uses the explicit atlas override `XK`. Unmapped countries warn, while retaining the city and its display name.
- **Link**: a plain HTTPS Google My Maps URL or a quoted iframe from Google. The importer reads only a single iframe `src` as inert data; it never renders your iframe HTML. Only exact `google.com`, `www.google.com`, and `maps.google.com` hosts and `/maps/d/[u/N/]embed` or `viewer` paths are accepted. Map IDs must be nonempty URL-safe letters, numbers, `_` or `-`. Embed settings `ll`, `z`, `ehbc`, and `noprof` are retained. `ll` stays a saved camera setting and is **not** used as city coordinates. Invalid links warn and disable that city's map action without removing the city.

The CSV parser supports BOM, CRLF, empty lines, quoted commas, doubled quotes, and multiline cells. Region/subregion labels and accents are preserved. Warnings include source row numbers and are also saved to `.cache/import-diagnostics.json`, outside public assets.

**Privacy:** every imported city's name, notes, visit history, coordinates, colors, and validated map links become part of your public static bundle. Only import records you intend to share. Source CSV files and diagnostics are not copied to `dist/`.

## Country visits and colors

Optionally add `data/country-visits.csv`:

```csv
CountryCode,Visited,FillColor
DE,Yes,#488F87
FI,,#5B75AD
```

A country is visited when any of its cities is visited **or** its country row says `Yes`. Blank/`No` never erases a recorded city visit. A legacy file with only `CountryCode` marks all listed countries visited. Duplicate country codes are an error. Custom `FillColor` works even for an unvisited country or a country with no listed city. A country can be visited while a particular city is not. Filters affect city pins and the list, never the country shading.

The sample's country-only German visit and blue Finnish override are in `fixtures/country-visits.demo.csv`; real imports never load that fixture.

## Resolve city coordinates (optional)

Skip this step if your export already has coordinates. For the original seven-column export:

1. Download `cities500.zip` and `countryInfo.txt` from <https://download.geonames.org/export/dump/>.
2. Extract `cities500.txt` and put both text files in `data/geonames/`.
3. Run:

```sh
npm run data:resolve-coordinates
# Or supply another local download directory:
npm run data:resolve-coordinates -- /path/to/geonames
```

The command matches missing locations by country and normalized primary, ASCII, or alternate city name. It saves **only unique** matches to `data/coordinates.csv` (`CityId,Latitude,Longitude`), preserves previously saved coordinates, and reports ambiguous/missing matches for manual review. It does not make per-city geocoding requests. Explicit valid coordinates in the main CSV always win. GeoNames is credited when a coordinates sidecar is used; its data is CC BY 4.0.

## Globe and map data

Drag or touch-drag to rotate; wheel/pinch or use the buttons to zoom. The initial globe faces Eastern Europe. Cities remain individual pins at every zoom. Click a pin or pick a city in the panel to fly to its regional view. Country and city rows are profile links: right-click, middle-click, or Cmd/Ctrl-click opens a new tab, while ordinary clicks preserve in-panel navigation. Country/province boundaries and labels remain visible through zoom 10. The locate button restores the initial globe without clearing city selection. Search accepts city/country names and ignores accents; all four map status filters start unfiltered. A continent filter appears automatically for collections spanning multiple continents. `⌘/Ctrl K` focuses search.

On desktop, the small H button beside the country scoreboard enables country hover; it starts off. Hover lifts the country by two pixels with a soft shadow, retaining its visited color and year stripes, and narrows the Countries list. Switch H off to clear the hover filter. Click or tap land to open the country profile and frame its boundaries. Desktop country profiles retain their raised outline. Phones and touch-only layouts omit H, hover layers and hover event handlers entirely, while country taps still open profiles. City pins take priority. Reduced-motion preferences remove the lift animation. The country collection has no search field; `⌘/Ctrl K` opens city search.

The app starts immediately with a **bundled Natural Earth atlas**. It tries OpenFreeMap Dark for closer-scale geographic labels without an API key. The style is stripped down to land/water and geographic names; roads, buildings, POIs, and other thematic layers are excluded. The same selection is applied to a custom style:

```sh
cp .env.example .env.local
# Set VITE_MAP_STYLE_URL in .env.local, then restart/rebuild.
```

If the provider is blocked or unavailable, the bundled globe, fills, international borders, first-level divisions, and country labels still work. If WebGL is unavailable, the city list, filters, details, and map links remain usable.

Atlas assets in `public/atlas/` are generated from **Natural Earth 5.1.2** Admin 0 countries at 1:50m and Admin 1 boundary lines at 1:10m. `npm run atlas:prepare` uses versioned source URLs with pinned SHA-256 verification and Mapshaper simplification (45% / 9%, fixed precision). Source caches stay in `.cache/atlas/`. Label anchors/ranks come from Natural Earth. Country joins use `ISO_A2_EH`, verified local codes, and explicit overrides for `FRA`, `NOR`, `KOS`, `CYN`, `SOL`, `SAH`, and `SDS`; source display names are retained. Boundaries represent Natural Earth's cartography, not a statement about disputed territory. Admin 1 lines begin fading in at zoom 3.7; provider boundaries are excluded to avoid duplicates.

City pins do not cluster. Pin labels start at zoom 4 and the maximum zoom is 10, configured in `src/lib/map-style.ts`. The single MapLibre instance updates its existing GeoJSON source on filtering, resizes with its container, and cleans up on unmount. The viewer overlays it rather than destroying it, preserving the current camera.

## Country profiles

Country profiles retain the Fraunces title and previous typography outside the statistics box. The box uses larger Alegreya Sans labels with the original Manrope and DM Sans number styling. The shared row badge is enlarged for profiles, inset and vertically centered beside short and wrapped names. Every tenth displayed visit order uses a crowned medallion in the same footprint as the shield, with extra space around the number, consistently in rows and profiles and across the 195/197 country scopes. Visited countries have green cards; unvisited countries have a solid grey background. A compact square-cornered statistics box contains population, total area and GDP per capita by default, followed by their world and continental raw medians. Click the GDP heading to switch the third column to total GDP; an explicit preference is remembered in this browser. The new default replaces the previous release's implicit total-GDP preference. A dashed rule separates the raw figures from each metric's index and world/continental index medians. The layout always has three columns. Facts, city highlights and attractions remain unchanged, as does the travel scoreboard and visit history.

With a production build served on port 4173, `npm run country:preview-fonts` captures the actual profile with the original country-title font and two body-text options: softer Nunito and Alegreya Sans for short names, wrapped names, unvisited countries and crown milestones. It writes PNG comparisons and a self-contained `preview.html` into `.cache/country-profile-fonts` (override with `PROFILE_PREVIEW_OUTPUT`). Alternate preview fonts are development-only and do not add requests to the deployed app.

Country and city visit histories share a light timeline. Years and visits run newest first, with a visit count beside years containing multiple visits and a separate total for each visit. Actual stays within a visit remain chronological; dots mark dates, solid segments show stay durations, and dashed links separate stays without adding gap days. A duration that differs from the inclusive calendar span is marked with an asterisk on its segment. The rightmost total displays only a clock emoji and number. Timeline colors use the panel date palette, including the panel's yellow rather than the globe's brighter yellow. Cross-year visits sit under their latest recorded year and retain the actual endpoint years; incomplete dates remain explicitly unrecorded. This presentation never regroups counted visits or changes stored history.

Country timelines list the cities whose actual dated stays overlap each segment, deduplicated and ordered by arrival. Captions wrap above compact segments. Matching uses individual stay periods and leaves unknown dates unmatched; place records are excluded. City profile timelines keep their existing presentation.

Ordinary visit rows keep their compact default height. Rows with multiple months or wrapped content grow independently, without stretching other visits or year groups. Content stays centered with equal top and bottom padding; separators do not add to a row's height. City and country rows both use 9px vertical and 8px horizontal padding. Standard city rows have a 56px minimum height; extra content can grow its own row. Day-only range segments use a compact 76px length; month/year labels keep 84px in both city and country timelines. December–January headings display January above December while endpoint dates stay chronological. Dates are centered on their circles. Four dash strokes join the measured circle edges on the same visual line; wrapped stays start a fresh line. A row-local ResizeObserver updates only the SVG connectors when layout changes, with no React state updates or map rerenders. Box outlines use the panel year color.

The static sources are:

- `data/country-metrics.csv`: exact raw values and full-precision cached indices for all 250 workbook entities (197 countries and 53 territories), keyed by country/territory code. GDP is stored in USD billions. The additional `GdpPerCapitaUsd` and `GdpPerCapitaIndex` columns store the calculated USD-per-person figures and indices.
- `data/country-metric-medians.csv`: the seven rows copied directly from the workbook's **Medians 197** sheet, extended with the calculated GDP-per-capita medians. These are country-only raw and index medians; the two are never derived from one another.
- `data/country-comparison-regions.csv`: owner-selected comparison regions. Turkey uses European raw and index medians for every metric.
- `data/country-highlights.csv`: the existing ordered facts, city/town highlights and attractions.
- `data/sources/country-reference.json`: workbook and CSV checksums, provenance, scope and the Svalbard exclusion.
- `data/sources/country-reference/ciudad_mundo_three_indices_global_continental_medians.xlsx`: the owner's original workbook, retained unchanged.

Run `npm run country:prepare-reference` (requires Python `openpyxl`) to copy the cached sheet values to CSV and prepare the GDP-per-capita extension. Extraction verifies **Raw Data** and **Index Scores** agree. The original three metrics, indices and medians are copied unchanged. `npm run country:prepare-gdp-per-capita` rebuilds only the extension; `npm run country:verify-gdp-per-capita` checks stored results without writing. `npm run build` validates the CSVs and creates a bundled static lookup. No reference database requests, refresh timers, index calculations or aggregations run in the application. Existing Supabase travel records remain independent and unchanged.

The owner's [index method](docs/COUNTRY_METRIC_INDEX.md) is archived unchanged. At the owner's request, the offline preparation script applies model V1 to GDP per capita, calculated as `GDP in billions × 1,000,000,000 / population`. It uses separate country and territory ranking pools, full-precision competition ranks, and excludes missing values. A missing or zero population produces N/A. World and continental medians use available countries only; continental index medians use the global country indices rather than recalculating continental rankings. The original workbook metrics remain authoritative. Missing values remain N/A and numeric zero remains zero. The 53 territory records are retained for future use; they do not create country rows or visit records. Svalbard remains unfilled because the workbook's SJ record combines Svalbard and Jan Mayen, which the owner explicitly excluded from this update.

Median pools retain the workbook’s UN M49 grouping. Display comparisons follow that grouping unless an owner override in `data/country-comparison-regions.csv` selects another baseline. Turkey uses European medians, as requested; its workbook source row and all cached baseline values remain intact. Comparison labels identify the baseline actually shown; existing travel categories are unchanged. Country filters and the 195/197 visit-counter toggle never alter the supplied comparisons.

Raw figures use compact adaptive rounding: numbers at least 100 in their displayed unit round to an integer; smaller values usually use one decimal, retaining two when the hundredths digit is 3–7. Tiny values retain useful significant digits. China's and India's populations display exactly two decimals. Population and area use K/M (and B for large populations); GDP always uses B, including trillion-sized economies. GDP per capita uses compact units without a dollar sign; the tooltip identifies USD per person. Suffixes have visible spacing, and the area heading includes km². Reporting years are omitted. Comparison labels use “🌍 median” and short continent names (AF, AS, EU, NA, SA, OC), with the full name in the tooltip. Indices and median indices display one decimal, while the CSVs retain full precision.

## Places

Places such as Patagonia are separate from city records. They use a diamond pin labeled only with their name, list every associated country, and reuse the city profile. Selecting the pin raises its preloaded outline by two pixels; the outline stays selected in the profile and fits narrow screens. Country and city visit histories and city statistics remain independent. Map progress includes both city and place maps, while the result counter shows their counts separately.

The canonical sources are `data/places.csv`, `data/place-countries.csv`, and the GeoJSON files in `public/places/`. `data/sources/patagonia-outline.json` records the pinned Natural Earth source, checksums and broad scope: five Argentine provinces and three Chilean regions, excluding Antarctic claims. `npm run places:prepare-outline` reproduces that outline from the verified source.

`npm run build` imports the place CSVs into the bundled fallback. Use `npm run places:verify-migration` to check the additive database migration in a rolled-back transaction, `npm run places:apply` to save an approved batch to the separate `places` and `place_countries` tables, and `npm run places:verify-live` to compare saved records and geometry with the sources. The public snapshot reads both countries atomically; editor permissions govern map-status changes. Ship the CSVs, outline, database batch and site together.

Patagonia initially has no attached map and no inferred visit history. Its representative pin is inside the broad outline. Additional places can have one or several countries and their own Polygon or MultiPolygon boundary.

## Map label typography

Geographic levels use separate bundled font families with compact, zoom-dependent sizes:

- **Countries:** Noto Serif Semibold, about 13–18 px at regional and closer views (10.5 px at world scale).
- **Cities:** Inter Semibold, about 12–14 px, with small locator dots for basemap cities.
- **Subdivisions:** Roboto Condensed Italic, about 11–12 px, in a softer teal-gray.

Native-language second lines use the same family at 85% size. Identical native/Latin names are shown once; source casing and Cyrillic characters are preserved. The optional basemap supplies its own city/subdivision data; when it is unavailable, the bundled countries and tracked-city labels still use their distinct fonts.

Font families and sizes live in `src/lib/map-typography.ts`. The renderer reads local SDF `.pbf` glyphs in `public/fonts/`, including Latin and Kazakh/Cyrillic ranges. Normal installation, development, and production builds use these committed assets and need no font downloads or fonts installed on your computer.

For maintainers, `npm run fonts:prepare` regenerates the glyphs from the static TTF sources in `assets/fonts/`. It uses a pinned, checksum-verified MapLibre font-maker WebAssembly build, with no native compiler. Its first run downloads the generator from `raw.githubusercontent.com`; subsequent runs use the verified local cache. Source font URLs, checksums, licenses, and variation axes are recorded in `assets/fonts/manifest.json`.

## Annotated maps and sharing

A valid map's **View annotated map** button opens just that map's iframe in a focused viewer. Back/Escape closes it and restores focus. **Open in Google My Maps** always provides an external viewer link.

Shareable URLs work without server rewrites:

```text
?city=kyiv-ukraine
?city=kyiv-ukraine&view=map
```

Reload and browser Back are supported. Unknown city IDs return to a usable collection. Search and filters remain intact while opening/closing the viewer in the current session (they are not serialized into the URL).

Google controls the embedded content and access. Set the original My Map to **Anyone with the link** / publicly viewable in Google My Maps and verify it in a signed-out or private browser before publishing. An iframe `load` event means navigation finished, not that Google granted access. The two supplied live embeds could not be validated here because this environment blocks `www.google.com`; browser tests use an explicit mock for viewer navigation and verify the actual canonical URL. They do not claim Google's map contents loaded.

## Persistent saving with Supabase

Country history uses three linked CSVs and database tables so a counted visit
can contain several actual stay periods. The country panel reads database
history when configured, with a bundled fallback. Recorded visits/days are
labelled separately from unknown lifetime totals. See
[the CSV format](data/templates/COUNTRY-VISITS.md) and
[database design and rollout](docs/country-history.md).

Set both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to enable the database-backed collection. In that mode, visitors have read-only access; the configured editor signs in with email and password on the same page and saves statuses to PostgreSQL. Email links remain available for first-time password setup and recovery. Browser-only overrides are imported only after explicit owner review. Privileged credentials are never bundled. See [docs/supabase.md](docs/supabase.md) for cloud provisioning, permissions, migration, export, and verification.

## Build and deploy

```sh
npm run build              # your real CSV is required
# OR, explicitly:
npm run build:demo
npm run preview
```

Upload the contents of **`dist/`** to any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.). Vite uses a relative base so the app and data work from a repository subpath, including `/MyMap/?city=…`. Use the directory URL with its trailing slash. No server-side routing is necessary. Rebuild after editing CSVs or environment variables. A static host does not need access to your raw CSVs.

For restricted cloud environments, allow `tiles.openfreemap.org` for the optional provider and `www.google.com` for embeds (plus `maps.google.com` if using that host directly). Installation uses `registry.npmjs.org`; atlas refresh uses `raw.githubusercontent.com`. The bundled atlas and fonts need no external requests.

## Verification

```sh
npm run build
npm test
npm run test:browser
```

The browser suite uses system Chromium by default in this cloud environment. On a Mac:

```sh
npx playwright install chromium
# Playwright's installed Chromium is used if system Chromium is absent; or:
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

The browser suite selects the included real collection after a normal build. It checks all 321 entries, source statuses, the supplied country history and independent city visits, country/continent filters, reviewed coordinates and aliases, Nice and Vienna's distinct map links, intentional missing positions, layouts down to 320px, saved-status isolation and tab synchronization, and the WebGL fallback. For the existing camera, pin selection, notes/date, history, and blocked-storage regression suite, run `npm run build:demo` followed by `npm run test:browser`; finish with `npm run build` to restore the real collection.

Unit tests compare the prepared collection with the latest uploaded source and cover coordinate provenance, URL validation, CSV edge cases, stable/duplicate IDs, visits/dates, typography, and independent country/pin colors. External-provider and live Google embed availability remain separate network-dependent checks.

## Credits

- [Natural Earth](https://www.naturalearthdata.com/), public-domain geographic data.
- [OpenFreeMap](https://openfreemap.org/) and [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), optional basemap; provider attribution remains visible.
- [GeoNames](https://www.geonames.org/export/), CC BY 4.0, when using the optional local coordinate resolver.
- Map label fonts: Noto Serif, Inter, and Roboto Condensed, under the SIL Open Font License. Legacy Open Sans glyphs from the MapLibre demo atlas remain bundled; DM Sans and Manrope from Fontsource are used in the interface. Fonts and licenses are bundled locally. See `assets/fonts/manifest.json` and `public/fonts/`.
