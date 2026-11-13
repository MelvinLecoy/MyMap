# Country history: three linked CSV tables

The build imports `data/countries.csv`, `data/country-visit-history.csv`, and
`data/country-visit-periods.csv`. These templates are current fillable copies.
Blank values mean unknown, never an invented zero.

## Country overview

One row per country, identified by `CountryCode`. The 197-country set retains
Kosovo and Taiwan, and `Is195` selects the base 195. Territories used by existing
city records remain available separately. Preserve `FirstVisitOrder`: this is
the supplied lifetime ordering, independent of yearbook coverage. Honduras is
98 in the 197 view and 97 in the 195 view; Kosovo is 74 in the full list.

| Column                            | Meaning                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| CountryCode, Country, Continent   | Stable identifier and geography.                             |
| Is195                             | 1 for the base 195; 0 for Kosovo and Taiwan.                 |
| VisitStatus                       | visited, planned, not-visited or unknown.                    |
| FirstVisitOrder                   | Supplied lifetime order; blank if unknown.                   |
| TimesVisited, TotalDaysSpent      | Reported lifetime totals. Leave unknown totals blank.        |
| RecordedVisits, RecordedDaysSpent | Derived from the actual stay periods; checked during import. |
| VisitHistoryComplete              | 1 only if every lifetime visit is listed; currently 0.       |
| Notes                             | Country context and source qualifications.                   |

There are 98 known visited countries. The yearbook has qualifying dates for 92;
the other six retain visited status and unknown dates, counts and days.
Do not copy recorded subtotals into lifetime-total columns.

## Counted visits

`country-visits-template.csv` corresponds to `data/country-visit-history.csv`.
Columns: `CountryCode,Country,VisitNumber,ArrivalDate,DepartureDate,DaysSpent,Notes`.
`(CountryCode,VisitNumber)` is unique. Numbers order the known recorded visits;
they do not establish that earlier lifetime visits are absent. Partial dates
YYYY or YYYY-MM remain supported for other historical records.

Current data has 114 dated, counted visits plus six undated known visits.
The six undated rows have no duration or actual-stay rows and do not contribute
to the yearbook's recorded totals.

## Actual stays

`country-visit-periods-template.csv` corresponds to `data/country-visit-periods.csv`.
Columns: `CountryCode,Country,VisitNumber,PeriodNumber,ArrivalDate,DepartureDate,SourceRefs,Notes`.
Each row is an uninterrupted stay with exact YYYY-MM-DD dates. Numbers start
at 1 within each visit. SourceRefs identifies the original date cells.

Arrival and departure count inclusively. A next stay starts a new counted visit
when its first date minus the previous stay's last date is at least 14 days.
Shorter gaps merge visits but add no days. Actual stays cannot overlap.
Visit start/end must match its first/last stay, and DaysSpent must equal the sum
of its actual stays, not the enclosing calendar span.

Example: Australia's first recorded visit spans 24 July–3 August 2025 but has
actual stays of 24–27 July and 29 July–3 August: 10 days, not 11.
New Zealand's two 2025 stays count as one visit and five actual days.
The UK May 2026 stay is 1–2 May; 3 May counts only for Bosnia & Herzegovina.

## Sources and regeneration

`data/sources/yearbook-*.csv` contains the independently verified extraction;
`yearbook-provenance.json` records workbook hashes and the approved correction.
Only Organized is used; SA3.0, midnight-only additions and unflagged airport
transits are excluded. Hong Kong is grouped under China and England under GB.
The Malaysia flag on 21 July 2025 is retained despite the Seoul/KL itinerary
ambiguity, documented in the country notes.

Run `python scripts/prepare-yearbook-data.py` from the project root to regenerate
the live CSV inputs and templates. It preserves membership, lifetime order,
reported lifetime totals and history completeness. Run `npm run data:import`
then `npm test` and the browser checks after changes.

The corrected dataset has 114 dated visits, 125 actual stays and 270 country-days.
Border-crossing dates may count for both countries. Coverage is incomplete
lifetime history; six countries have no yearbook date evidence.

## Database and website

See `docs/country-history.md` for the additive migration and import. Tables are
countries → country_visits → country_visit_periods. Calculated recorded totals
and 195/197 display ranks are not independently stored in the database.
The country panel reads one consistent database snapshot when Supabase is
configured and retains a bundled/last-confirmed snapshot during outages.
The existing website editor still saves city map status; country history is
managed through validated imports, not a new country-editing form.
