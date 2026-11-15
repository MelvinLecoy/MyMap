# Data updates

- For each owner-approved data batch, update the tracked source files and GitHub CSVs, Supabase, and the deployed site together.
- City stays start a new counted visit when the next arrival is at least six calendar days after the previous departure. Keep actual periods and explicit half-day durations; gaps add no days.
- Country history remains independent and incomplete unless the owner requests a country update. Its grouping threshold remains 14 days.
- Use normal, focused checks for data-only batches: import validation, relevant data/database tests, a production build, and a brief live check. Run broader browser regressions when related UI changes or failures warrant them.
- Country reference figures, indices, and raw/index medians are copied from the owner's workbook into static CSVs. Do not recalculate them in the application. `docs/COUNTRY_METRIC_INDEX.md` is retained for future reference; formula implementation is deferred until the owner requests it.
- Leave the Svalbard-only profile's reference figures unfilled: the supplied workbook combines Svalbard and Jan Mayen. Preserve that combined source row for future use without applying it to Svalbard.
