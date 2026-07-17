# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-07-17

### Fixed

- **Task › Create** failed against the live API with an opaque HTTP 400 ("Body
  does not match schema"). The create body now normalizes the **deadline** to a
  bare `YYYY-MM-DD` (the API's date fields are `format: date` and reject the
  `dateTime` input's ISO `...T...Z` value) and caps **assignees** to the single
  value the schema accepts (`maxItems: 1`). When no reminder is set, a zero-day
  reminder is sent so the `minItems: 1` `reminders` array is never empty.
- Missing title / deadline / assignee / referenced-asset values now surface a
  clear node error up front instead of the opaque schema-mismatch 400 — the API
  rejects tasks with no reference ("References cannot be empty"), a server rule
  not encoded in the OpenAPI schema.
- **Task › Update** applies the same deadline normalization and assignee cap,
  and normalizes the existing task's deadline during the fetch-merge-PUT
  round-trip so an update can no longer reintroduce a datetime-formatted date.

## [0.3.0] - 2026-07-05

### Added

- Expanded the **File** resource with Get, Get Many, Download Data, and
  Download Thumbnail operations. Downloads emit n8n binary data under a
  configurable binary property name.
- Added **Person** operations: Create, Update, Get, Get by ID, Get Many,
  Delete, and Create User. Create wraps dynamic person fields as `{ fields }`;
  Update sends bare fields, matching the current SDKs.
- Added read-only **User** lookup/list operations: Get, Get by ID, and Get Many.
- Added **Field Definition** administration for Asset, Room, and Person
  templates: Create, Update, Get, and Get Many. Create/Update support field
  type constraints, attributes, relations, default values, and possible values.
- Added **Circularity Hub Item** operations for suggestions, adding objects,
  Get, Get Many, Update, and Delete.
- Added **Circularity Hub Order** operations for Create, Get, Get Many, and
  Update.
- Added shared SDK-style list/filter helpers and lightweight Node built-in
  tests for query encoding, filter-object bodies, field-definition payloads,
  and Location/Location-Id parsing.

## [0.2.2] - 2026-06-11

### Fixed

- Corrected the `node` field in both codex files
  (`Seventhings.node.json`, `SeventhingsTrigger.node.json`) to use the
  fully-qualified `<npm-package-name>.<nodeName>` format required by n8n:
  `@seventhingscompany/n8n-nodes-seventhings.seventhings` and
  `@seventhingscompany/n8n-nodes-seventhings.seventhingsTrigger` (previously
  the placeholder `n8n-nodes-base.*` prefix).

## [0.2.1] - 2026-06-11

### Changed

- Lowercased the **seventhings** brand name everywhere it is user-visible to
  match the company's styling: the action and trigger node display names, plus
  all README, CHANGELOG, and code-comment prose. The credential keeps the
  title-cased **Seventhings API** display name, which n8n's linter requires for
  credentials (`cred-class-field-display-name-miscased`). Internal identifiers
  (class names, TypeScript types, file/folder paths) and the node
  `name`/credential `name` machine keys are unchanged, so existing workflows
  and credentials remain compatible.

## [0.2.0] - 2026-06-06

### Changed

- Established a clean release pipeline that follows n8n's community-node
  requirements: `release` (`n8n-node release`) and `prepublishOnly`
  (`n8n-node prerelease`) scripts, plus tidied `package.json` packaging
  metadata. No node, credential, or runtime behaviour changed.

## [0.1.2] - 2026-06-01

### Fixed

- Credential authentication failed for everyone ("Authorization failed"),
  including in 0.1.1. The hidden `sessionToken` property was declared as
  `type: 'string'`, but n8n only runs `preAuthentication` (the login that
  fetches and caches the token) when it finds a property that is **both**
  `type: 'hidden'` and `expirable: true`. With `type: 'string'` the login was
  skipped entirely, so every request — and the credential Test — went out with
  an empty bearer token and got a 401. Changed `sessionToken` to
  `type: 'hidden'` (keeping `password` + `expirable`), matching n8n's canonical
  `MetabaseApi` / `CrowdStrikeOAuth2Api` credentials. The "Session Token" field
  is now correctly hidden from the credential UI.

## [0.1.1] - 2026-06-01

### Fixed

- Credential authentication failed for all users ("Authorization failed").
  `preAuthentication` sent the password-grant login body as a plain object,
  which n8n's `httpRequest` helper serializes as JSON despite the
  `application/x-www-form-urlencoded` header — so the auth endpoint rejected
  the request. The body is now built as `URLSearchParams`, which the helper
  form-encodes correctly (and sets the matching Content-Type itself).

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
- **seventhings Trigger** node (`polling`): New/Updated Asset; New/Updated/
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
