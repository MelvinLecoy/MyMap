# Visit history marker rules

Owner-approved rules for both country and city profile timelines.

## Ordinary stays

- A filled circle means the endpoint date is inclusive.
- Ordinary date ranges use filled circles at both ends.
- An ordinary one-day stay uses one filled circle with a white **1** inside it. The numeral is **10px**; keep the existing circle size. At phone widths of **600px or less**, lower only the white numeral by **1px**. Keep its desktop position and all diamond labels unchanged.
- These same rules apply to individual stays joined by dashed links. Dashed links indicate a gap between stays; they add no days.

## Exceptional durations

An asterisk marks a recorded duration that differs from the inclusive calendar span. Retain the recorded duration and asterisk; a hollow circle represents a half-day endpoint.

Use **0.8em** for an asterisk beside a duration such as **2.5\***, and **1.2em** when it is inside a diamond. The diamond's asterisk retains font weight **900**.

Only the numeral **1** inside a diamond uses **8px** text at **font weight 900**. Its asterisk keeps its existing styling: **1.2em** relative to the unchanged **7px** label container, at weight **900**. Ordinary white **1** labels remain **10px** at their existing weight.

### Cities

| Case                                 | Arrival                               | Departure / presentation                                                  |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------- |
| Default exceptional stay             | Filled circle                         | Hollow circle                                                             |
| Singapore's exceptional one-day stay | One hollow diamond containing **1\*** | Both dates appear below the diamond; the asterisk has font weight **900** |

Singapore's ordinary stays still follow the ordinary rules above.

### Countries

| Exceptional stay in                         | Arrival                               | Departure                                             |
| ------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Bosnia & Herzegovina (BA)                   | Hollow circle                         | Filled circle                                         |
| Dominican Republic (DO)                     | Hollow circle                         | Filled circle                                         |
| Czechia (CZ), exceptional one-day stay      | One hollow diamond containing **1\*** | Both dates below the diamond; asterisk weight **900** |
| Czechia (CZ), other exceptional durations   | Hollow circle                         | Hollow circle                                         |
| Singapore (SG), exceptional one-day stay    | One hollow diamond containing **1\*** | Both dates below the diamond; asterisk weight **900** |
| Singapore (SG), other exceptional durations | Hollow circle                         | Hollow circle                                         |
| Indonesia (ID)                              | Hollow circle                         | Hollow circle                                         |
| All other countries                         | Filled circle                         | Hollow circle                                         |

The country overrides apply only to exceptional durations. Singapore's exceptional **11–12 September 2026** stay uses the same hollow **1\*** diamond in both country and city timelines, with **11–12** centered below it. In the country visit spanning August–September, the earlier **3 Sep** label already identifies September. Czechia's exceptional country stay on **12–13 May 2024** uses the same diamond, with **12–13** centered below it. Other exceptional Czechia country durations retain hollow endpoints.

## Preserve the existing presentation

- Keep other styles unchanged: typography, spacing, row padding and default heights, card borders, dividers, month headings, visit counts and clock totals.
- Keep the existing panel date colors: 2026 green, 2025 yellow, 2024 orange, and 2023 or earlier brown.
- Stacked multi-month headings always show the newer month above the older month in both country and city histories: **JUL** above **JUN**, **JAN** above **DEC**, and the same rule for every other pair. Endpoint dates and segments still run from arrival to departure.
- Every counted visit has one shared month-range heading, including visits with disconnected stays in different months. For example, Singapore's August–September visit uses **SEP – AUG** as one stacked heading. In a multi-month visit, include the month name only on the first displayed date of each month: **18 Aug**, **20**, **25**, **3 Sep**, **11–12**. Keep each stay, its duration and the dashed gaps intact; do not display separate August and September headings within that visit. Same-month visits keep one month name and day-only dates. Cross-year visits include the actual year alongside each first month label.
- Keep ordinary baseline range lengths; adaptive country captions may extend their segments to support the text. Disconnected-stay connectors repeat China's default 5px dashes with 1px gaps. Longer gaps add dashes instead of stretching a fixed four strokes. Center the pattern so both ends join their measured marker edges inside a dash. Center each date label under its marker; wrapped stays start a new visual line.
- Allow extra space between year-bearing date labels so they do not overlap, including Antigua's December–January visit. Keep the same default dash length and spacing.
- Center markers on the same visual line together, including a circle followed by a diamond. Rows grow only as needed for their own content.
- Keep counted visits, recorded dates, explicit durations, city membership and statistics unchanged. Marker and caption choices are presentation rules only.

## Adaptive country city captions

- Captions containing multiple cities use an individual capsule outline with fully rounded ends around each city, with zero inner padding and 1px between capsules on both axes. There are no dot separators. Single-city captions remain plain. The solver measures the text plus each 1px border and the 1px gaps, preserving complete city names when choosing line breaks.

- When every stay in one counted visit has the same single known city, show its name above the month heading on the left, once for the whole visit. Reserve enough width for the name and wrap long names within that column; align the month with the timeline markers.
- All visits within a country share the same compact city/month column width, with no added leading date indent. Move month-qualified visits left to the ordinary baseline; do not move ordinary rows right to match extra date padding. Center every month heading in that column and align the first timeline markers across visits. Size the column by the longest city-name word, wrapping multiword names such as Santo Domingo rather than reserving their full one-line width. A wrapped left-city label uses the same compact 11px line height and 2px gap above the month as a one-line label. Align a single-track visit's clock badge with the markers. If a long date would overlap the stacked month heading, add only the vertical clearance that date needs; keep the compact timeline start.
- Otherwise, center each stay's city caption above the middle of its segment or circle. Measure the actual loaded caption font and available width. Prefer keeping the entire visit on one timeline track; use one caption line and extend the segment to support it whenever space permits.
- When one caption line cannot fit, balance complete city names over the fewest necessary lines before splitting the timeline. The UK 2023 visit fits London and Bristol on one line and Bath, Cardiff, Southampton / London, Portsmouth on two lines at a 390px viewport. Switzerland's 2024 visit fits its three stays on one timeline with up to three city-caption lines per stay at that width; its 2023 cities fit one caption line.
- Before wrapping a narrow multi-month visit, try stacked captions with shorter readable segments. This includes Australia and New Zealand: stack their city names rather than retaining a long one-line caption that forces a second timeline track. Narrower layouts may still need another track when the markers, durations and dates cannot fit safely. Preserve each actual stay, chronological order, date alignment, year colors, marker shapes and the default dash pattern. Resizing and font loading recalculate only the local caption layout and connectors.
- Keep short forms in the exported `VISIT_CAPTION_SHORT_NAMES` dictionary in `src/lib/visit-caption-layout.ts`. Use them only in this country visit-history caption layout and solver. Canonical names, city lists, profiles, stored data and full-name caption tooltips remain unchanged.
- Preserve the existing seven country caption exclusions. City-profile histories keep their current layout.

| Canonical city      | Caption short form |
| ------------------- | ------------------ |
| Gold Coast          | GC                 |
| Rio de Janeiro      | Rio                |
| Buenos Aires        | BA                 |
| Andorra la Vella    | Andorra lV         |
| Kuala Lumpur        | KL                 |
| Johor Bahru         | JB                 |
| Ho Chi Minh City    | HCMC               |
| Bandar Seri Begawan | BSB                |
| San Pedro Sula      | SPS                |

The endpoint policy is implemented in [`src/lib/visit-markers.ts`](../src/lib/visit-markers.ts). The timeline is rendered by [`src/components/VisitTimeline.tsx`](../src/components/VisitTimeline.tsx).

## CSV exports

The tables are also stored as UTF-8 CSVs:

- [Marker rules](../data/exports/visit-history-marker-rules.csv): ordinary stays, defaults and country/city exceptions.
- [Starred country visits](../data/exports/starred-country-visits.csv): **12** exceptional stay periods across **11** countries.
- [Starred city visits](../data/exports/starred-city-visits.csv): **11** exceptional stay periods across **11** cities.

The visit tables are a snapshot of the current canonical history exported on **15 November 2026**, with visit/period numbers, exact dates, recorded days, inclusive calendar days and the selected marker presentation. Both Singapore entries and Czechia's exceptional country stay use `hollow-diamond` with `1*`. These reference exports do not replace the canonical history CSVs or change database records.

## Multi-month profile audit: 15 November 2026

The shared month-range presentation was checked in **18 profiles**:

- **Countries (10):** Australia, Canada, China, Denmark, France, Guatemala, Japan, New Zealand, Singapore and United Arab Emirates.
- **Cities (8):** Antigua (Guatemala), Copenhagen, Los Angeles, Miami, New York City, Shanghai, Tokyo and Vancouver.
