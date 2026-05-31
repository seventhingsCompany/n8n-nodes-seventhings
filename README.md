# @seventhingscompany/n8n-nodes-seventhings

This is an n8n community node. It lets you use [seventhings](https://seventhings.com/) in your n8n workflows.

seventhings is an asset-management and inventory platform for tracking physical assets, tasks, rental cases, locations and rooms across an organization. This package adds two nodes: a **Seventhings** action node for reading and writing those records, and a **Seventhings Trigger** node that starts workflows when records change.

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

### Seventhings (action node)

Manage assets, tasks, rental cases, locations, rooms and files. The node is organized by **resource**, each with its own set of operations.

| Resource | Operations |
|----------|------------|
| **Asset** | Create, Update, Get, Get Many, Archive, Unarchive, Delete, Move to Location, Move to Room, Attach File, Detach File |
| **Task** | Create, Update, Get, Get Many, Close, Reopen, Delete |
| **Rental Case** | Create, Update, Get, Get Many, Delete |
| **Location** | Create, Update, Get, Get Many, Delete |
| **Room** | Create, Update, Get, Get Many, Delete |
| **File** | Upload |

Notes:

- **Get** looks a record up by UUID; **Get Many** lists/filters records with a **Return All** toggle and a **Limit**.
- **Asset** and **Room** Create/Update expose your tenant's own custom fields dynamically (via a resource mapper that reads the field definitions), so the inputs match your seventhings configuration.
- **Asset → Create** supports a find-or-create behaviour to avoid duplicates.
- **Asset → Attach File / Detach File** target an attachment-type field, picked from a dropdown of the asset's attachment fields.
- **Room** records belong to a **Building** (a Location), selected from a dropdown.
- **File → Upload** accepts either an upstream node's **binary** data or a public **URL** to download, and returns the uploaded file's UUID — which you can then attach to an asset.

### Seventhings Trigger (polling)

Starts a workflow when seventhings records change. The trigger **polls** the API (there are no webhooks). Pick one event:

- **New Asset**, **Updated Asset**
- **New Task**, **Updated Task**, **Task Closed**, **Task Reopened**, **Task Overdue**, **Task Due Soon**
- **New Rental Case**, **Updated Rental Case**, **Rental Case Returned**

**Task Due Soon** has a **Days Ahead** input (default 3) controlling how far ahead to look for upcoming deadlines.

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
- The action node is usable as a tool by AI agents.

New to n8n? See the [Try it out](https://docs.n8n.io/try-it-out/) documentation to get started.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [seventhings API documentation](https://helpcenter.seventhings.com/en/articles/58547-how-do-i-use-the-seventhings-api)

## Version history

### 0.1.0

Initial release. Full parity with the seventhings Zapier integration:

- **Seventhings** action node with Asset, Task, Rental Case, Location, Room and File resources.
- **Seventhings Trigger** node with 11 polling events.
- Session-token authentication with automatic refresh.
