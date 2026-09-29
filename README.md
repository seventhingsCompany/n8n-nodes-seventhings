# @seventhingscompany/n8n-nodes-seventhings

This is an n8n community node. It lets you use [seventhings](https://seventhings.com/) in your n8n workflows.

seventhings is an asset-management and inventory platform for tracking physical assets, tasks, rental cases, locations, rooms, persons, users, files and Circularity Hub workflows across an organization. This package adds two nodes: a **seventhings** action node for reading and writing those records, and a **seventhings Trigger** node that starts workflows when records change.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Install the package `@seventhingscompany/n8n-nodes-seventhings` from **Settings → Community Nodes** in your n8n instance.

## Operations

This package provides two nodes.

### seventhings (action node)

Manage assets, tasks, rental cases, locations, rooms, files, persons, users, field definitions and Circularity Hub records, retrieve change history, and generate PDF reports. The node is organized by **resource**, each with its own set of operations.

| Resource | Operations |
|----------|------------|
| **Asset** | Create, Update, Get, Get by Barcode, Get History, Get Many, Archive, Unarchive, Delete, Move to Location, Move to Room, Attach File, Detach File |
| **Task** | Create, Update, Get, Get History, Get Many, Close, Reopen, Delete |
| **Rental Case** | Create, Update, Get, Get History, Get Many, Delete |
| **Location** | Create, Update, Get, Get History, Get Many, Delete |
| **Room** | Create, Update, Get, Get History, Get Many, Delete |
| **File** | Upload, Get, Get Many, Download Data, Download Thumbnail |
| **Person** | Create, Update, Get, Get by ID, Get History, Get Many, Delete, Create User |
| **Report** | Create, Get Many Templates |
| **User** | Get, Get by ID, Get Many |
| **Field Definition** | Create, Update, Get, Get Many |
| **Circularity Hub Item** | Add Objects, Suggest Category, Suggest Rest Price, Get, Get Many, Update, Delete |
| **Circularity Hub Order** | Create, Get, Get Many, Update |

Notes:

- **Get** looks a record up by UUID; **Get Many** lists/filters records with a **Return All** toggle and a **Limit**.
- **Asset** and **Room** Create/Update expose your tenant's own custom fields dynamically (via a resource mapper that reads the field definitions), so the inputs match your seventhings configuration.
- **Asset → Create** supports a find-or-create behaviour to avoid duplicates.
- **Asset → Attach File / Detach File** target an attachment-type field, picked from a dropdown of the asset's attachment fields.
- **Room** records belong to a **Building** (a Location), selected from a dropdown.
- **File → Upload** accepts either an upstream node's **binary** data or a public **URL** to download, and returns the uploaded file's UUID — which you can then attach to an asset.
- **File → Download Data / Download Thumbnail** write binary output to a configurable binary property.
- **Person** Create/Update uses your tenant's person field definitions dynamically, matching the SDK's flexible field map.
- **Field Definition** operations are schema administration operations for Asset, Room and Person templates.
- **Circularity Hub** operations cover SDK item/order workflows, category and rest-price suggestions, and adding assets to the hub.
- **Asset → Get by Barcode** looks up an exact scancode, including archived assets. Supply the raw barcode; the node URL-encodes it automatically and preserves spaces and leading zeros.
- **Get History** returns one n8n item per recorded change, newest first, with **Return All** and **Limit** controls. Event payloads are preserved, including asset merge data and JSON-encoded `details` snapshots. Records without history produce no items. Rental history requires the tenant's rentals feature and appropriate permissions; API errors are surfaced normally.
- **Report → Get Many Templates** lists the available PDF templates. **Report → Create** renders one PDF from a selected template and an ordered list of asset UUIDs. The PDF is generated on demand and is not stored by the API.

### seventhings Trigger (polling)

Starts a workflow when seventhings records change. The trigger **polls** the API (there are no webhooks). Pick one event:

- **New Asset**, **Updated Asset**
- **New Task**, **Updated Task**, **Task Closed**, **Task Reopened**, **Task Overdue**, **Task Due Soon**
- **New Rental Case**, **Updated Rental Case**, **Rental Case Returned**

**Task Due Soon** has a **Days Ahead** input (default 3) controlling how far ahead to look for upcoming deadlines.

Automatic polling seeds its state on the first successful run without replaying existing records. Manual runs return sample records without changing that state. Updated Task and Updated Rental Case compare record contents because those resources do not expose reliable update timestamps. Status events fire when a record enters the selected status; deadline events also detect a changed deadline.

Polling observes the records returned by the API: asset and rental-case polls currently inspect the latest 50 records, and task signature history is bounded to 2,000 entries. Changes outside that polling window and intermediate changes between polls are not guaranteed to be detected.

## Credentials

You need a seventhings account and API access.

**Prerequisites**

- A seventhings instance (you log in at `https://<yourcompany>.seventhings.com`).
- A **Client ID**, found in seventhings under **Integrations → Rest API**.

**Setting up the credential**

Create a **Seventhings API** credential with:

- **Subdomain** — the `<yourcompany>` part of your seventhings URL.
- **Username** — your seventhings login (an email address).
- **Password** — your seventhings password.
- **Client ID** — from Integrations → Rest API.

Authentication uses a session bearer token obtained via a password grant. n8n fetches and caches the token automatically and refreshes it when it expires, so you only ever enter the four fields above. Use **Test** to confirm the connection.

## Compatibility

- Requires **n8n 1.x** (uses `n8nNodesApiVersion: 1`).
- Built and tested against **Node.js 20+**.

No known incompatibilities. If you hit one, please open an issue.

## Usage

- Records are selected through searchable dropdowns (resource locators) — start typing to find an asset, task, location, room or rental case, or paste a UUID directly.
- For list operations, enable **Return All** to fetch every record, or leave it off and set a **Limit**.
- For **Asset → Attach File / Detach File**, first **Upload** a file (File resource) to get its UUID, then choose the asset's attachment field from the dropdown.
- For **File → Download Data / Download Thumbnail**, set **Output Binary Field** to the binary property name downstream nodes should read.
- For **Field Definition** Create/Update and Circularity Hub Update operations, JSON inputs are validated before requests are sent.
- The action node is usable as a tool by AI agents.

### Barcode and history workflows

1. Select **Asset → Get by Barcode** and enter a scancode, such as `INV/100`.
2. Add another seventhings node with **Asset → Get History**.
3. Set **Asset → By UUID** to `{{ $json.asset_uuid }}` and choose a limit or enable **Return All**.

History is also available directly under Task, Rental Case, Location, Room and Person. For an archived asset, pass its UUID directly to the history operation.

### Generate a PDF report

1. Select **Report → Create** and choose a **Report Template** from the searchable dropdown, or enter its UUID.
2. Set **Asset UUIDs** to a comma-separated list, or an expression returning an array. The list order is retained in the PDF.
3. Set **Output Binary Field** (default `data`) and **File Name** (default `report.pdf`).
4. Use the binary output in a downstream file-storage or email node.

Each input item generates one PDF. To produce a single report for several assets, aggregate their UUIDs into one input item first. **Report → Get Many Templates** can be used to discover template UUIDs in a workflow.

New to n8n? See the [Try it out](https://docs.n8n.io/try-it-out/) documentation to get started.

## Development and tests

```sh
npm test       # Build and run the offline node:test suites
npm run lint  # n8n community-node lint checks
npm run dev   # Start n8n with the local nodes
```

The suites in `tests/` adapt the Zapier integration's API-contract scenarios to n8n's execution model. They invoke the compiled action node, polling node, credential, and dynamic methods, mocking only the HTTP/binary helper boundary. Coverage includes all exposed resource operations, request bodies, pagination, authentication errors, binary transfers, dynamic field mapping, polling deduplication, and n8n item linking / continue-on-fail behavior. They require no live credentials and make no network requests.

These are not live n8n workflow tests: credential refresh orchestration and end-to-end API behavior still require a configured n8n instance.

`tests/sdk-v1.4.test.js` covers the nine new endpoints from API spec `v0.19571_89862c247_20260915`: barcode escaping, all six history routes, pagination, untouched event payloads, template discovery, ordered PDF requests, binary output, validation and API errors. It also covers person sorting and UUID response compatibility.

For manual verification, run `npm run dev`, open the local n8n instance, configure a **Seventhings API** credential, and try the barcode/history and PDF workflows above. The new operations require a tenant API exposing the September 2026 endpoints. Verify a generated PDF opens correctly and contains assets in the requested order.

To check the compiled n8n implementation against a live seventhings tenant, set `SEVENTHINGS_SUBDOMAIN`, `SEVENTHINGS_USERNAME`, `SEVENTHINGS_PASSWORD`, and `SEVENTHINGS_CLIENT_ID`, then run `npm run smoke:read`. Alternatively, after building, use `node --env-file=/path/to/.env tests/live-smoke.js` (Node 20.6+). The script also accepts the existing Zapier test-tenant environment variable names. It checks authentication, resource reads, barcode lookup, all six history routes, PDF templates and generation, dropdowns, field mappers, and manual polling using a live HTTP adapter. Generated PDFs are validated in memory; the API does not store them. Checks requiring absent records or templates are reported as skipped. The script does not create or modify tenant records or start an n8n server.

With credentials in the git-ignored local `.env`, run:

```sh
npm run build
node --env-file=.env tests/live-smoke.js
```

### Publishing releases

Run `npm run release` locally from `main` for the interactive n8n release flow,
or create a version tag/release in GitHub (for example, `0.4.0` or `v0.4.0`).
The Publish workflow uses that tag as the npm version and updates `package.json`
and `package-lock.json` in the runner before building and publishing with provenance.
Creating a tag in GitHub does not update version metadata or the changelog on `main`;
after each successful release, update `main` so `package.json` and both root version
entries in `package-lock.json` match the latest published npm version. For example,
after publishing `0.4.1`, run this on `main` if the versions are not already aligned:

```sh
npm version 0.4.1 --no-git-tag-version --ignore-scripts
```

Update `CHANGELOG.md` to reflect the release, then commit and merge these changes
into `main` through the normal review process. Verify the manifests on `main` match
the published version even when the release was prepared on another branch.

To recover an unpublished tag after merging a workflow fix, use **Actions → Publish →
Run workflow**, select `main`, and enter the existing tag. For example:

```sh
gh workflow run publish.yml --ref main -f tag=0.4.0
```

This uses the current workflow to check out and publish the original tagged source.
Re-running an old failed run uses its old workflow definition instead. npm versions
are immutable, so only retry versions that have not already been published.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [seventhings API documentation](https://helpcenter.seventhings.com/en/articles/58547-how-do-i-use-the-seventhings-api)
* [Current API reference](https://api.seventhings.com/)
* [Published OpenAPI description](https://api.seventhings.com/customer-api.json)

## Version history

### 0.4.0

Added the nine endpoints introduced in the [Go SDK v1.4.0](https://github.com/seventhingsCompany/customer-api-go/releases/tag/v1.4.0) and [PHP SDK v1.4.0](https://github.com/seventhingsCompany/customer-api-php/releases/tag/v1.4.0), matching API spec `v0.19571_89862c247_20260915`: barcode lookup, history for six resources, PDF template discovery, and PDF report generation. Person sorting now uses the API's deep-object query format, and empty legacy person UUIDs correctly fall back to the newer UUID field.

### 0.3.0

Expanded SDK parity with Files, Persons, Users, Field Definitions and Circularity Hub:

- File metadata lookup/list and binary data/thumbnail downloads.
- Person create/update/get/list/delete and create-user workflows.
- Read-only user lookup/list operations.
- Field Definition create/update/get/list for Asset, Room and Person templates.
- Circularity Hub item/order operations, suggestions and add-object workflow.

### 0.1.0

Initial release. Full parity with the seventhings Zapier integration:

- **seventhings** action node with Asset, Task, Rental Case, Location, Room and File resources.
- **seventhings Trigger** node with 11 polling events.
- Session-token authentication with automatic refresh.
