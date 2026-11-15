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
- Keep ordinary range lengths and the current four-dash connector style. Connect the actual marker edges and center each date label under its marker; wrapped stays start a new visual line.
- Allow extra space between year-bearing date labels so they do not overlap, including Antigua's December–January visit. Keep the four-dash connection style.
- Center markers on the same visual line together, including a circle followed by a diamond. Rows grow only as needed for their own content.
- Keep counted visits, recorded dates, explicit durations, city captions and statistics unchanged. Marker choices are presentation rules only.

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
