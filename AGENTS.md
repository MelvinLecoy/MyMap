# Data updates

- For each owner-approved data batch, update the tracked source files and GitHub CSVs, Supabase, and the deployed site together.
- City stays start a new counted visit when the next arrival is at least six calendar days after the previous departure. Keep actual periods and explicit half-day durations; gaps add no days.
- Country history remains independent and incomplete unless the owner requests a country update. Its grouping threshold remains 14 days.
- Use normal, focused checks for data-only batches: import validation, relevant data/database tests, a production build, and a brief live check. Run broader browser regressions when related UI changes or failures warrant them.
- Country reference figures and comparisons are stored in static CSVs. The three original metrics retain the workbook's cached values. GDP per capita, its index and country/continental medians are calculated offline using `docs/COUNTRY_METRIC_INDEX.md` model V1, as subsequently requested by the owner. Do not recalculate reference stats in the application; rebuild CSVs with `npm run country:prepare-reference`.
- Leave the Svalbard-only profile's reference figures unfilled: the supplied workbook combines Svalbard and Jan Mayen. Preserve that combined source row for future use without applying it to Svalbard.
