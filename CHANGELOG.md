# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-01

Initial release — full parity with the seventhings Zapier integration, two
nodes (action + polling trigger) and a session-token credential.

### Added

- Package scaffolding: registered the real nodes and credential in
  `package.json`, seventhings icons (light/dark), and the shared `transport/`
  layer (`seventhingsApiRequest` with per-tenant base URL + error mapping,
  `toIsoUtc`/`toIsoDate`/`normalizeTimestamps`, subdomain/email/UUID
  validators, `Location`-header UUID parsing).
- `SeventhingsApi` credential with session-token auth (`preAuthentication`
  password grant, Bearer `authenticate`, `/users` test; expirable cached token
  auto-refreshed on 401).
- **Asset** resource: Create, Update, Get, Get Many (Return All / Limit with
  pagination), Archive, Unarchive, Delete, Move to Location, Move to Room,
  Attach File, Detach File. Dynamic tenant fields via a resourceMapper
  (field-definitions → typed columns) with value coercion, asset pickers via
  `listSearch`, find-or-create on Create, and create-then-fetch via the
  `Location` header.
- **Task** resource: Create, Update, Get, Get Many, Close, Reopen, Delete.
  Complete typed write bodies (title, deadline, assignees, references,
  reminders), status transitions, and read→write sanitization on update.
- **Rental Case** resource: Create, Update, Get, Get Many, Delete. Renter
  type/value, references, issue/due dates + reminders, responsible user, and
  status filtering.
- **Location** and **Room** resources: Create, Update, Get, Get Many, Delete,
  with searchable dropdowns. Locations use a fixed schema (name + address
  fields); Rooms use a resourceMapper over room field-definitions plus a
  Building (Location) dropdown. Update is PATCH (partial body).
- **File** resource: Upload (multipart) from upstream binary data or a public
  URL, returning the uploaded file's UUID.
- **Seventhings Trigger** node (`polling`): New/Updated Asset; New/Updated/
  Closed/Reopened/Overdue/Due Soon Task; New/Updated Rental Case; Rental Case
  Returned. High-water-mark dedupe for asset/rental-case events and a
  seen-UUID set for task events (tasks carry no timestamps); Days Ahead input
  on Task Due Soon; first scheduled poll seeds the cursor without replaying
  history; manual mode returns a fresh sample.
- ISO-8601 UTC timestamp normalization applied to every record before output.

### Notes

- The objects list endpoint keys filters by operator
  (`filter[<key>][eq]=<value>`); the scalar (`filter[key]=v`) and array
  (`filter[key][]=v`) forms return HTTP 500. The find-or-create and Get Many
  filters use this form.
- Archive/Unarchive synthesize an `archived` boolean on the returned record
  because the API's GET response does not include one.
- Per-resource UUID fields differ: assets use `asset_uuid`, locations
  `location_uuid`, rooms `room_uuid`, tasks/rental cases `uuid`. The
  normalizers read the right field and mirror it onto `uuid`.
- The task list endpoint returns a bare array (no pagination wrapper) and tasks
  carry no `created_at`/`updated_at`, so task triggers dedupe on seen UUIDs
  rather than a timestamp watermark.
