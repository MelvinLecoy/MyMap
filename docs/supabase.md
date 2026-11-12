# Supabase-backed atlas

The website supports static CSV mode and a database-backed mode. With both
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` configured, the deployed
app reads `public.cities`; public visitors cannot change statuses. Only users
explicitly listed in `atlas_private.editors` can save changes. A publishable key
is public browser configuration; account access tokens and service-role/secret
keys must never be placed in `VITE_` variables or committed.

## Cloud provisioning

All commands run in the cloud checkout. No files on the owner's computer are
needed. Connect `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` through the cloud
environment's secret settings, scoped to `api.supabase.com` and `api.vercel.com`
respectively. Permit those domains, the specific Supabase project hostname, and
the deployed website in the cloud network settings. Save/apply those settings
before running the provisioning command.

Create a private, ignored `.cache/cloud-setup.json` with these non-credential
settings, replacing the example values:

```json
{
  "projectRef": "your-project-reference",
  "ownerEmail": "owner@example.com",
  "siteUrl": "https://your-site.vercel.app/",
  "vercelProject": "your-site"
}
```

Run `npm run supabase:provision`. It verifies both projects, installs the schema,
imports the prepared CSV and reviewed coordinate sidecar, configures the sole
editor account, disables public sign-ups, and sets the auth redirect URLs. It
checks public reads, rejects anonymous writes, and verifies an authenticated
owner save using a temporary session that is subsequently revoked. No sign-in
email is sent during that verification. It then sets the two public production
variables on Vercel. Deploy the tested Git commit to activate the integration.

The importer preserves existing map status, visit status/date, notes, and pin
colors when a city ID already exists. Metadata updates do not change an
unchanged row's revision. The two intentionally unplaced entries retain null
coordinates. Existing records are not removed by import. An unexpected existing
editor causes provisioning to stop rather than change another account's access.

For manual setup, run `supabase/migrations/202611120001_atlas.sql` using the
project's SQL editor. A privileged operator must then add the intended auth user
UUID to `atlas_private.editors` and import the normalized collection. Public
sign-up and the auth site/redirect URLs must also be configured. The automated
command performs these steps and verifies them together.

## Editing and migration

Use **Editor sign in** and enter the configured owner's email. The sign-in link
must open in the same browser that requested it (PKCE). Supabase's email delivery
configuration and limits apply; its built-in sender restricts recipient addresses
to members of the Supabase organization unless a custom SMTP service is set up.
The owner email must be supported by that sender. Sign-in never creates an
account automatically. Signing in with an unlisted account grants no edit rights.

Saving updates the selected city by ID and its previously read `updated_at`.
A conflict or failed save restores the confirmed value and reports the failure.
The collection refreshes on focus and every 30 seconds while visible. A database
outage leaves the latest available collection browsable with editing paused.
The initial static snapshot remains available if the database cannot be reached.

Browser-only statuses are never automatically uploaded. After owner sign-in,
**Import saved** previews differences and lets the owner select what to copy.
The database applies the selected changes atomically and rejects stale revisions.
Browser data is removed only for successfully confirmed changes. The CSV export
includes the live statuses, visits, dates, coordinates, map links, and notes, and
can be imported by the existing CSV pipeline.

Changing a map status never changes visit status. Existing year-only and
month-only visit dates remain supported. The free Supabase plan's inactivity
and recovery policies apply; retain periodic exports independently.

## Verification

- `npm test`: import/export, public-key validation, and real PostgreSQL RLS and
  transaction tests through PGlite, including another authenticated user's denial.
- `npm run test:cloud`: browser tests with a simulated Supabase API for sign-in,
  permissions, cross-device reads, persistence, write failures, conflicts,
  migration review/rollback, and CSV export. These tests send no real email and
  do not replace live-project verification.
- `npm run build` and `npm run test:browser`: the existing real-collection
  production and layout regression checks in static mode.

The cloud tests use a local development server and a synthetic publishable key.
Production key validation rejects incomplete settings and privileged keys before
bundling. Provisioning logs never print API keys, auth links, or session tokens.
