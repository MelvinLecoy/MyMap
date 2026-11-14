# Approved duration update and city panel

The 2026-11-13 corrections retain 114 dated country visits and add two actual
Singapore stays, giving 127 country stays and 273.5 recorded country-days.
Singapore totals 7 days, South Korea 6.5, the UK 12.5, New Zealand 5.5 and
Czechia 4. Czechia's 12–13 May 2024 stay explicitly counts as one day. UK visits
1 and 2 are unchanged. The additional Singapore stays merge into its existing
2026 visit under the unchanged 14-day rule.

Shanghai's 30–31 August 2026 city stay becomes 1.5 days; its separate September
stay remains one day. Singapore’s 11–12 September stay also becomes one day, giving 248 city-days over
the existing 111 stays in 57 cities at that stage. A later set of four owner-approved
Los Angeles, Orlando, Boston and San Francisco corrections brings the recorded
city total to 249.5 days, with visit and city source files updated together.
Subsequently, 13 stays in 12 newly visited cities add 16 summed city-days,
bringing the total to 265.5 days over 124 stays in 69 visited cities. The full
collection expands from 323 to 325 entries with Austin and San Antonio. Country and city durations remain independent.

Country period CSVs now accept optional DaysSpent. Blank means the inclusive
calendar span; an explicit value overrides it. All country period, visit and
reported-total durations accept half-day increments. Counts and visit order
remain integers. The additive migration converts integer day columns to numeric
and adds a nullable period duration. It rejects quarters without rounding them
and checks cached visit totals against the sum of actual durations.

The website appends a duration only when it differs from the inclusive date
span, such as `(1 day)` or `(3.5 days)`. Ordinary dates have no annotation.
Every visit and country summary uses actual durations. The shared 2025 color
is `#887200` for date labels and globe stripes; it provides at least 4.5:1
contrast against the panel background. Other year colors and country fills stay
unchanged.

The Cities panel adds visit/day statistics and a map-progress overview. Progress
buttons update the existing status filter and globe; totals follow the visible
results. Individual city rows show visit count, latest month/year, days and map
status. The existing row height is retained. Opening a city shows the same
history and editable map status. Saving map progress preserves its visit data.

`npm run history:prepare-updates` prepares the scoped SQL transaction.
`npm run history:verify-updates` exercises it on Supabase and rolls it back.
`npm run history:apply-updates` commits it. The transaction verifies each target
row against its approved old/new state and preserves unrelated rows, country
metadata, city metadata and UK visits 1/2. Conflicting edits roll back the
whole transaction. Identical reapplication is a no-op.

Release the compatible website reader before applying fractional live country
data: the previous reader accepts only whole country days. The new reader also
accepts the existing database format, allowing a coordinated rollout without
requiring fractional data to arrive before its reader. Verify the deployed
commit and live snapshots after applying the transaction.
