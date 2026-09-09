# Laboratory Borrowing Management

Static GitHub Pages frontend with a Google Apps Script Web App and Google Sheets database. Do not deploy the Apps Script backend until the database setup and item catalog below are complete.

## Architecture

`GitHub Pages (index.html) -> Apps Script Web App -> Google Sheets`

The browser sends structured JSON and never chooses a unit, category, or item name for storage. The Apps Script backend validates each submitted `ItemID` against the `Items` master sheet.

## Database schema

`setupDatabase()` creates these sheets automatically when they are absent:

- `BorrowerLogs`: `LogID`, `Timestamp`, `Department`, `FacultyName`, `GroupsRequested`, `Incident`, `IncidentDetails`
- `BorrowedItems`: `ItemLogID`, `LogID`, `ItemID`, `ItemName`, `Category`, `Quantity`, `Unit`
- `Items`: `ItemID`, `ItemName`, `Category`, `DefaultUnit`, `Active`

Each successful submission writes one `BorrowerLogs` row and one `BorrowedItems` row for every item. IDs are generated server-side, for example `LOG-20260909-0001` and `BI-000001`.

`Items` is the master catalog. Add active items manually after setup, for example:

```text
EQ-001 | Microscope     | Equipment  | pcs | TRUE
CON-001 | Ethyl Alcohol | Consumable | mL  | TRUE
```

Only these units are allowed: `pcs`, `set`, `pair`, `box`, `pack`, `bottle`, `roll`, `mL`, `L`, `mg`, `g`, `kg`. New departments are `CAHP`, `CNAM`, `JHS`, and `SHS`.

## Setup and deployment

1. Create or select the Google Spreadsheet and copy its ID from the URL.
2. Open **Extensions -> Apps Script** and paste [Code.gs](Code.gs).
3. Set `CONFIG.SPREADSHEET_ID`; do not commit a real ID.
4. Run `setupDatabase()` once and authorize it. It creates and formats missing sheets, including frozen/styled header rows, text/number/date formats, and the `Asia/Manila` spreadsheet timezone.
5. Run `getDatabaseStatus()` and confirm all three sheets exist and have valid headers.
6. Add the required master data to `Items`. Use unique IDs, the exact categories `Equipment` or `Consumable`, an approved `DefaultUnit`, and `TRUE` in `Active`.
7. Deploy **New deployment -> Web app**, execute as **Me**, and select access appropriate for the intended users.
8. Copy the deployed `/exec` URL into `API_URL` in [index.html](index.html), then publish the static repository through GitHub Pages. No build step is required.

## API

- `GET ?action=health` — health response.
- `GET ?action=items&category=Equipment` — active master items; category is optional.
- `GET ?action=list` — borrower logs with their structured borrowed items; supports `department`, `faculty`, `from`, and `to` filters.
- `GET ?action=stats` — totals and item usage grouped by item and canonical unit.
- `POST` `{ "action": "submit", "payload": { "department", "facultyName", "groupsRequested", "incident", "incidentDetails", "items": [{ "itemId", "quantity" }] } }`.

Count units require whole quantities. Measurement units allow decimals. Quantities must be finite, positive, and within the configured maximum. Duplicate submitted item IDs are consolidated before rows are written. Each submission is validated before writing; `LockService` and rollback protect the linked log/item write as one logical transaction.

Reports use the structured `items` data returned by `list`, not serialized text. They display quantities by item and unit, and deliberately do not combine incompatible units. The code has a future conversion boundary, but does not currently convert `mL` to `L`, `mg` to `g`, or `g` to `kg`.

## Legacy data

The prior serialized `BorrowerLogs` format is not automatically migrated. If it already exists, `setupDatabase()` preserves it unchanged and reports that migration is required; it will not overwrite, reorder, or guess data. This includes historical `JHS/SHS` records, which must not be reassigned to JHS or SHS without a manual, reviewed migration.

## Privacy

The Web App access setting governs who can submit and read logs. The `/exec` URL is not a secret, so use an access policy appropriate for the borrower data and do not publish the spreadsheet to the web.
