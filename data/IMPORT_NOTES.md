# Published collection

The collection uses the latest user-provided `MyMap_Converted_Full.csv`, included here unchanged. `cities.csv` is the ready-to-run version: map links have their `src="..."` wrappers removed, explicit country codes and stable IDs are added, and every visit is provisionally **Not Yet** (`Visited=No`). The source's city names, map statuses, continent, region, and subregion are preserved.

There are **321 entries**, **319 matched locations**, and **321 distinct Google My Maps IDs**. The source includes the corrected Johannesburg, Uganda, Belize City, Frankfurt am Main, Kingstown, and Nice map link.

## Reviewed matching decisions

- **Iguazu and Lofoten remain unplaced**, as requested. They remain searchable and their My Maps links work independently of the globe position. Their two missing-location import warnings are intentional.
- **Longyearbyen uses Svalbard (SJ)** and **Sevastopol uses Ukraine (UA)**, following the GeoNames country codes with the user's approval.
- **Krong Siem Reap** uses the Siem Reap city coordinates; its supplied display name is retained.
- Same-country names with multiple candidates use the clearly dominant main city where its population is at least 50,000 and ten times the next candidate. Eighteen entries use this rule; the other matches use unique primary/alternate names or the reviewed Siem Reap alias.
- Short country names such as Bosnia, Brunei, St. Lucia, Timor Leste, and Syria receive explicit ISO country codes. Their display names remain as supplied.

## Coordinates and attribution

`coordinates.csv` records the GeoNames ID beside every coordinate pair. Coordinates come from GeoNames cities500, distributed by geonamescache 3.0.2, under CC BY 4.0. The app displays GeoNames attribution. Source hashes and import totals are recorded in `collection-info.json`.

## Runtime and verification

Normal `npm run dev` and `npm run build` use this collection. Demo fixtures are available only through explicit demo commands and are not included in the normal collection. Saved real-collection map statuses are kept separately from saved demo statuses.

Run `npm test`, `npm run build`, and `npm run test:browser` to verify this collection. The browser configuration selects the real-collection suite for a normal build, or the existing five-city suite after an explicit `npm run build:demo`.

Google map URLs and viewer navigation are checked, including Nice and Vienna's distinct IDs. Live Google content and sharing permissions require a browser with Google access; the managed cloud environment blocks that host, so automated viewer checks mock only the external iframe response.
