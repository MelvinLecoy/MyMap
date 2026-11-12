# Elsewhere — a personal travel atlas

A responsive, static travel globe inspired by the supplied reference: navy panels, blue-green geography, colored countries, city pins, a searchable collection, and focused city details. The map and city panel fill the browser window, with no outer header, navigation, footer, or page margins. Built with React, TypeScript, Vite, and MapLibre GL JS. No API key or backend is required.

## Run on a Mac

Tested with **Node 24.22.1** and npm 11.9.0. Use Node 22.12 or newer; `.nvmrc` pins the tested version.

```sh
cd MyMap
nvm install                 # optional, if you use nvm
nvm use
npm ci
npm run dev
```

Open the address Vite prints (normally `http://localhost:5173`). The dev command imports your CSV before starting. If `data/cities.csv` is absent, it uses the five-city sample fixture and labels the city list **Sample data**. Restart the dev command after changing CSV inputs. Dependencies and versions are pinned in `package-lock.json`.

The sample includes Moscow and Kyiv's supplied My Maps links and illustrative records for Warsaw, Prague, and Helsinki. Sample visits, dates, notes, and colors are **not your personal travel history**.

## Commands

| Command                            | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                      | Import real data, or use the labeled sample when absent; start Vite |
| `npm run data:import`              | Validate and import your real CSV                                   |
| `npm run data:import -- --demo`    | Import the sample explicitly                                        |
| `npm run data:resolve-coordinates` | Optional offline GeoNames matching                                  |
| `npm run atlas:prepare`            | Download, verify, simplify, and regenerate the bundled atlas        |
| `npm run typecheck`                | Check application, import scripts, and tests                        |
| `npm test`                         | Run import and coordinate-resolution tests                          |
| `npm run build`                    | Import real data, type check, and produce `dist/`                   |
| `npm run build:demo`               | Explicitly build the labeled sample into `dist/`                    |
| `npm run preview`                  | Serve the last production build                                     |
| `npm run test:browser`             | Browser smoke tests against the last build                          |

`npm run build` deliberately fails with an actionable message if `data/cities.csv` is missing. It will never silently publish the sample in place of your data. `build:demo` is the explicit alternative.

## Add your collection

Put your UTF-8 export in **`data/cities.csv`**. This file is ignored by Git. Keep these headers (case and surrounding whitespace do not matter; `City` is accepted as an alias for `Cities`):

```csv
Cities,Country,Continent,Region,SubRegion,Status,Link
```

Optional columns:

```text
Latitude,Longitude,CityId,CountryCode,Visited,LastVisited,PinColor,Notes
```

- **Status**: `Complete`, `Update`, `Unfinished`, or `Not Started`. Case and whitespace are normalized; legacy `Done` becomes `Complete`. Missing/unknown statuses stop import with the row number.
- **Visited**: `Yes`, `No`, or blank → Visited, Not visited, or Visit not recorded. This is independent of map completion.
- **LastVisited**: `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`. A valid date implies a visit when `Visited` is blank. A valid date paired with `No` produces a warning and an unknown visit (the contradictory date is withheld until corrected). Malformed dates warn and are omitted. Dates display without timezone shifts.
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

Drag or touch-drag to rotate; wheel/pinch or use the buttons to zoom. The initial globe faces Eastern Europe. Click a cluster to expand it, or pick a city in the panel to fly to its regional view. Country/province boundaries and labels remain visible through zoom 10. The locate button restores the initial globe without clearing city selection. Search accepts city/country names and ignores accents; all four map status filters start unfiltered. A continent filter appears automatically for collections spanning multiple continents. `⌘/Ctrl K` focuses search.

The app starts immediately with a **bundled Natural Earth atlas**. It tries OpenFreeMap Dark for closer-scale geographic labels without an API key. The style is stripped down to land/water and geographic names; roads, buildings, POIs, and other thematic layers are excluded. The same selection is applied to a custom style:

```sh
cp .env.example .env.local
# Set VITE_MAP_STYLE_URL in .env.local, then restart/rebuild.
```

If the provider is blocked or unavailable, the bundled globe, fills, international borders, first-level divisions, and country labels still work. If WebGL is unavailable, the city list, filters, details, and map links remain usable.

Atlas assets in `public/atlas/` are generated from **Natural Earth 5.1.2** Admin 0 countries at 1:50m and Admin 1 boundary lines at 1:10m. `npm run atlas:prepare` uses versioned source URLs with pinned SHA-256 verification and Mapshaper simplification (45% / 9%, fixed precision). Source caches stay in `.cache/atlas/`. Label anchors/ranks come from Natural Earth. Country joins use `ISO_A2_EH`, verified local codes, and explicit overrides for `FRA`, `NOR`, `KOS`, `CYN`, `SOL`, `SAH`, and `SDS`; source display names are retained. Boundaries represent Natural Earth's cartography, not a statement about disputed territory. Admin 1 lines begin fading in at zoom 3.7; provider boundaries are excluded to avoid duplicates.

All clustering and label thresholds live in `src/lib/map-style.ts`: radius 48, clustering through zoom 5, pin labels from zoom 4, and max zoom 10. The single MapLibre instance updates its existing GeoJSON source on filtering, resizes with its container, and cleans up on unmount. The viewer overlays it rather than destroying it, preserving the current camera.

## Annotated maps and sharing

A valid map's **View annotated map** button opens just that map's iframe in a focused viewer. Back/Escape closes it and restores focus. **Open in Google My Maps** always provides an external viewer link.

Shareable URLs work without server rewrites:

```text
?city=kyiv-ukraine
?city=kyiv-ukraine&view=map
```

Reload and browser Back are supported. Unknown city IDs return to a usable collection. Search and filters remain intact while opening/closing the viewer in the current session (they are not serialized into the URL).

Google controls the embedded content and access. Set the original My Map to **Anyone with the link** / publicly viewable in Google My Maps and verify it in a signed-out or private browser before publishing. An iframe `load` event means navigation finished, not that Google granted access. The two supplied live embeds could not be validated here because this environment blocks `www.google.com`; browser tests use an explicit mock for viewer navigation and verify the actual canonical URL. They do not claim Google's map contents loaded.

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
npm run typecheck
npm test
npm run build:demo
npm run test:browser
```

The browser suite uses system Chromium by default in this cloud environment. On a Mac:

```sh
npx playwright install chromium
# Playwright's installed Chromium is used if system Chromium is absent; or:
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

Coverage includes real WebGL globe startup, camera drag/zoom/reset, cluster expansion and pin selection, search/status filters, exact status/visit text, notes/dates, lazy viewer mounting, canonical links, URL/history handling, camera/filter preservation, keyboard navigation, a 360px layout, and the WebGL-unavailable fallback. Import coverage includes BOM/CSV edge cases, inert iframe HTML, safe/rejected links, stable IDs, duplicate IDs, missing/zero coordinates, visits/dates, and independent country/pin colors. External-provider and real Google embed availability are separate network-dependent checks. A full real-CSV build awaits your export.

## Credits

- [Natural Earth](https://www.naturalearthdata.com/), public-domain geographic data.
- [OpenFreeMap](https://openfreemap.org/) and [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), optional basemap; provider attribution remains visible.
- [GeoNames](https://www.geonames.org/export/), CC BY 4.0, when using the optional local coordinate resolver.
- Open Sans glyphs from the MapLibre demo atlas; DM Sans from Fontsource. Fonts are bundled locally, with license files in `public/fonts/`.
