# Country history: two CSV tables

Use `countries-template.csv` for the country overview and
`country-visits-template.csv` for individual trips. You can supply summary
information now and add trip dates later. The live build imports the tracked
`data/countries.csv` and `data/country-visit-history.csv` files, which contain
the supplied history; these templates are fillable copies for subsequent updates.

Your supplied order is preserved as 98 consecutive first visits: Kosovo is 74,
Honduras is 98, and Taiwan has no order yet. The old `73.5` notation has been
replaced with Kosovo's position in the full list. Switching the panel to 195
filters out Kosovo and Taiwan, then calculates the visible ranks; Honduras is
therefore 97 in that view.

## 1. Country overview: one row per country

`countries-template.csv` contains all 197 countries. Keep one row per country,
even when it has several visits.

| Column                 | Meaning                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CountryCode`          | Stable country identifier. Keep it unchanged.                                                                                                              |
| `Country`              | Display name, supplied for readability.                                                                                                                    |
| `Continent`            | Prefilled geography used by the country filters. Keep it unless correcting the classification.                                                             |
| `Is195`                | Membership flag: `1` for the base 195, `0` for Kosovo and Taiwan. This column never contains a visit rank.                                                 |
| `VisitStatus`          | `visited`, `planned`, `not-visited`, or `unknown`. Your 98 supplied countries are `visited`; the remaining countries are `unknown` until you confirm them. |
| `FirstVisitOrder`      | Whole-number order among all visited countries, including Kosovo and Taiwan when applicable. Unknown or unvisited countries stay blank.                    |
| `TimesVisited`         | Optional known all-time visit count. Leave blank if you do not know it yet; the existing first-visit row does not imply one visit in total.                |
| `TotalDaysSpent`       | Optional known all-time days in the country. Use a whole number, or leave blank if the total is unknown. Do not enter a partial subtotal here.             |
| `VisitHistoryComplete` | `0` while any visits are missing from the trip table; `1` once every visit is listed, even if some dates are unknown. Currently `0` for every country.     |
| `Notes`                | Country-level context. Trip-specific details belong in the other CSV.                                                                                      |

Blank cells represent missing values (`null`); do not type the word `null`.
Blank does not mean zero. Taiwan has `Is195 = 0` and a blank first-visit order:
its membership is known even though no visit information was supplied.

You can enter, for example, `TimesVisited = 5` while listing only the first
known visit. Keep `VisitHistoryComplete = 0` until the other four visit rows
are added. This preserves the information you know without inventing trips or
dates.

## 2. Trip history: one row per visit

`country-visits-template.csv` contains the 98 confirmed first visits. The other
countries have no trip rows yet. Country membership and first-visit order live
only in the country overview, so they are not repeated for every trip.

| Column          | Meaning                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `CountryCode`   | Links the visit to the country overview.                                                                 |
| `Country`       | Readable name; `CountryCode` is the identifier.                                                          |
| `VisitNumber`   | Visit within this country: `1` for the first, `2` for the next, and so on.                               |
| `ArrivalDate`   | Local arrival date: `YYYY-MM-DD`, or `YYYY-MM` / `YYYY` if that is all you know.                         |
| `DepartureDate` | Local departure date, using the same formats. Leave blank if unknown.                                    |
| `DaysSpent`     | Known whole-number duration of this visit, or blank to calculate from exact arrival and departure dates. |
| `Notes`         | Visit-specific notes, date estimates, or an explanation of the duration.                                 |

Add return visits by copying a country's trip row, increasing `VisitNumber`,
and replacing the trip details. Do not copy its first-visit dates into a return
visit. `(CountryCode, VisitNumber)` must be unique. For a new visited country,
add its first trip row and update its overview status and first-visit order.

Dates and days can stay blank. If you remember three visits but none of their
dates, create visit rows 1, 2, and 3. Mark the history complete only if those
are all the visits to that country.

## 195 and 197 are panel views

- **195:** the 193 UN member states plus Vatican City and Palestine; show
  countries where `Is195 = 1`.
- **197:** the same list plus Kosovo and Taiwan; show all country rows.

Calculate first-visit ranks across the selected country set, in
`FirstVisitOrder` order, before applying continent or search filters. A search
for Honduras must not change its rank to 1. Countries without a known order
have no displayed rank. A rank is independent of alphabetical row sorting.

| Country         | Is195 | Stored first-visit order | Rank in 195 view | Rank in 197 view |
| --------------- | ----- | ------------------------ | ---------------- | ---------------- |
| North Macedonia | 1     | 73                       | 73               | 73               |
| Kosovo          | 0     | 74                       | Hidden           | 74               |
| Tajikistan      | 1     | 75                       | 74               | 75               |
| Honduras        | 1     | 98                       | 97               | 98               |
| Taiwan          | 0     | blank                    | Hidden           | blank            |

`country-order-reference.csv` is a generated review sheet for all 197
countries. Its `DisplayOrder195` and `DisplayOrder197` columns are calculated,
not additional editable database fields. Keep Kosovo and Taiwan in the same
database when the panel switches. Existing city or territory records outside
this scope should be retained.

## Dates, durations, and totals

Use inclusive calendar days consistently. When two exact dates are supplied
and `DaysSpent` is blank, calculate:

`DaysSpent = DepartureDate - ArrivalDate + 1`

A same-day visit is one day. An entered `DaysSpent` overrides this calculation
and can supply a duration when dates are partial or unknown. Partial dates
retain their precision and do not generate an invented exact duration. Review
overlapping visits to the same country before adding their days together.

Summary values and trip calculations describe the same all-time totals; never
add them to each other:

| Situation                                                | Visit count                                                                                           | Total days                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| You supplied a known all-time total                      | Use `TimesVisited`.                                                                                   | Use `TotalDaysSpent`.                                                                    |
| No supplied total; every visit is listed                 | Count the trip rows.                                                                                  | Sum durations only when every visit has known days or two exact dates.                   |
| No supplied total; some history or durations are missing | Show the recorded count as a lower bound, such as “at least 1”; do not present it as the final total. | Show a known subtotal as incomplete, or leave unknown; never treat missing days as zero. |

`VisitHistoryComplete = 1` establishes that all visits are listed; it does not
establish that all their durations are known. A supplied all-time total must
not be less than its known trip subtotal. When complete details and supplied
totals disagree, flag the mismatch for review rather than silently replacing
either value. The build importer validates these rules and rejects inconsistent
complete totals. The panel leaves unspecified all-time totals unfilled.

## Filling in more data

1. Add any known all-time visit counts and total days to the overview. Leave
   unknown values blank.
2. Fill the first-visit rows, then add return visits and their dates or days.
3. Set `VisitHistoryComplete = 1` for each country whose visits are all listed.
4. For a newly supplied historical first visit, insert it in the overview's
   order and renumber later entries. Country codes and within-country visit
   numbers do not change when another country's rank changes.

For an explicitly unvisited country, use `not-visited`; its order stays blank
and its count and days may be `0`. Keep future trips out of past visit history
until they occur. Use `planned` for a country-level intention to visit.

`countries-examples.csv` and `country-visits-examples.csv` form a separate,
fictional example dataset. France has two visits and eight days; Japan has
two visits and seventeen days. Do not import these examples as your history.

## Proposed database mapping

Use a `countries` table for identity, membership, status, first-visit order,
reported all-time totals, visit-history completeness, and country notes. Use
a related `country_visits` table for visit numbers, dates with their original
precision, duration overrides, and visit notes. Keep country codes stable and
enforce unique country orders when present and unique visit numbers within a
country. Store the reported totals separately from any totals calculated by
queries; calculated ranks do not need stored columns.

The website now imports the known country history from the two tracked CSVs.
Country histories are currently updated through those files and rebuilt for
deployment. The two database tables above remain a proposed mapping for future
country editing; the existing Supabase city table is unchanged.
