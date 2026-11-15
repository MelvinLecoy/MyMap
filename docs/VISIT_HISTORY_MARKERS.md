# Visit history marker rules

Owner-approved rules for both country and city profile timelines.

## Ordinary stays

- A filled circle means the endpoint date is inclusive.
- Ordinary date ranges use filled circles at both ends.
- An ordinary one-day stay uses one filled circle with a white **1** centered inside it.
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

| Exceptional stay in       | Arrival       | Departure     |
| ------------------------- | ------------- | ------------- |
| Bosnia & Herzegovina (BA) | Hollow circle | Filled circle |
| Dominican Republic (DO)   | Hollow circle | Filled circle |
| Czechia (CZ)              | Hollow circle | Hollow circle |
| Singapore (SG)            | Hollow circle | Hollow circle |
| Indonesia (ID)            | Hollow circle | Hollow circle |
| All other countries       | Filled circle | Hollow circle |

The country overrides apply only to exceptional durations. A country stay with one recorded day across two dates still has two hollow endpoints where specified above. Singapore's city timeline uses the diamond instead.

## Preserve the existing presentation

- Keep other styles unchanged: typography, spacing, row padding and heights, card borders, dividers, month headings, visit counts and clock totals.
- Keep the existing panel date colors: 2026 green, 2025 yellow, 2024 orange, and 2023 or earlier brown.
- Keep ordinary range lengths and the current four-dash connector style. Connect the actual marker edges and center each date label under its marker; wrapped stays start a new visual line.
- Keep counted visits, recorded dates, explicit durations, city captions and statistics unchanged. Marker choices are presentation rules only.

The endpoint policy is implemented in [`src/lib/visit-markers.ts`](../src/lib/visit-markers.ts). The timeline is rendered by [`src/components/VisitTimeline.tsx`](../src/components/VisitTimeline.tsx).
