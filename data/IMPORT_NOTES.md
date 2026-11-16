# Published collection

The canonical collection contains **343 cities**, **341 located cities**, and **321 distinct Google My Maps IDs**. The superseded initial conversion export and maintained city-visit aggregate CSV have been removed; earlier versions remain in Git history.

- `cities.csv` stores stable city IDs, city names, country references, map status/link, inline coordinates for the 22 additions, and independent visit-status overrides.
- `coordinates.csv` supplies the other 319 reviewed positions and their GeoNames IDs. No city has the same position maintained in both files.
- `reference/country-geography.csv` is the owner's final country name/classification authority. `reference/country-labels.csv` holds only explicit display-name overrides and the Svalbard fallback.
- `city-visit-periods.csv` stores actual stays and exceptional duration overrides. Inclusive ordinary durations, counted-visit bounds/totals and LastVisited are derived from them.
- `countries.csv` stores country membership and independent collection facts. Country trip rows retain only independent/partial-date overrides and notes; known date/day summaries come from their stay periods.

`readCollectionCsv` reconstructs the established full import/exchange shape in memory. Browser CSV exports, standalone legacy CSV imports and current application behavior remain supported. `data:verify-sources` rejects reintroduced redundant fields; `data:normalize` normalizes reviewed files only after verifying exact business-data parity. Templates contain headers rather than obsolete copies of the owner's records.

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
