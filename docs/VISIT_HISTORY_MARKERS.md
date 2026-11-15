# Visit history marker rules

Owner-approved rules for both country and city profile timelines.

## Ordinary stays

- A filled circle means the endpoint date is inclusive.
- Ordinary date ranges use filled circles at both ends.
- An ordinary one-day stay uses one filled circle with a white **1** centered inside it. The numeral is **10px**; keep the existing circle size.
- These same rules apply to individual stays joined by dashed links. Dashed links indicate a gap between stays; they add no days.

## Exceptional durations

An asterisk marks a recorded duration that differs from the inclusive calendar span. Retain the recorded duration and asterisk; a hollow circle represents a half-day endpoint.

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

The country overrides apply only to exceptional durations. Singapore's exceptional **11–12 September 2026** stay uses the same hollow **1\*** diamond in both country and city timelines, with **11–12** centered below it. Czechia's exceptional country stay on **12–13 May 2024** uses the same diamond, with **12–13** centered below it. Other exceptional Czechia country durations retain hollow endpoints.

## Preserve the existing presentation

- Keep other styles unchanged: typography, spacing, row padding and default heights, card borders, dividers, month headings, visit counts and clock totals.
- Keep the existing panel date colors: 2026 green, 2025 yellow, 2024 orange, and 2023 or earlier brown.
- Stacked multi-month headings always show the newer month above the older month in both country and city histories: **JUL** above **JUN**, **JAN** above **DEC**, and the same rule for every other pair. Endpoint dates and segments still run from arrival to departure.
- Keep ordinary range lengths and the current four-dash connector style. Connect the actual marker edges and center each date label under its marker; wrapped stays start a new visual line.
- Center markers on the same visual line together, including a circle followed by a diamond. Rows grow only as needed for their own content.
- Keep counted visits, recorded dates, explicit durations, city captions and statistics unchanged. Marker choices are presentation rules only.

The endpoint policy is implemented in [`src/lib/visit-markers.ts`](../src/lib/visit-markers.ts). The timeline is rendered by [`src/components/VisitTimeline.tsx`](../src/components/VisitTimeline.tsx).

## CSV exports

The tables are also stored as UTF-8 CSVs:

- [Marker rules](../data/exports/visit-history-marker-rules.csv): ordinary stays, defaults and country/city exceptions.
- [Starred country visits](../data/exports/starred-country-visits.csv): **12** exceptional stay periods across **11** countries.
- [Starred city visits](../data/exports/starred-city-visits.csv): **11** exceptional stay periods across **11** cities.

The visit tables are a snapshot of the current canonical history exported on **15 November 2026**, with visit/period numbers, exact dates, recorded days, inclusive calendar days and the selected marker presentation. Both Singapore entries and Czechia's exceptional country stay use `hollow-diamond` with `1*`. These reference exports do not replace the canonical history CSVs or change database records.
