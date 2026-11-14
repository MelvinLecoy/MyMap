# Data updates

- For each owner-approved data batch, update the tracked source files and GitHub CSVs, Supabase, and the deployed site together.
- City stays start a new counted visit when the next arrival is at least six calendar days after the previous departure. Keep actual periods and explicit half-day durations; gaps add no days.
- Country history remains independent and incomplete unless the owner requests a country update. Its grouping threshold remains 14 days.
- Use normal, focused checks for data-only batches: import validation, relevant data/database tests, a production build, and a brief live check. Run broader browser regressions when related UI changes or failures warrant them.
