# Laboratory Borrowing Management

Static GitHub Pages frontend with a Google Apps Script Web App and Google Sheets database.

## Architecture

`GitHub Pages (index.html) -> Apps Script Web App -> Google Sheets`

The browser sends structured JSON. Equipment uses a whole-number quantity with no unit; consumables use decimal-capable quantity and a free-text unit. Apps Script derives category from the section.

## Database schema

`setupDatabase()` creates these sheets automatically when they are absent:

- `BorrowerLogs`: `LogID`, `Timestamp`, `Department`, `FacultyName`, `GroupsRequested`, `EquipmentBorrowed`, `ConsumablesBorrowed`, `Incident`, `IncidentDetails`
- `BorrowedItems`: `ItemLogID`, `LogID`, `ItemName`, `Category`, `Quantity`, `Unit`

Each successful submission writes one human-readable `BorrowerLogs` row, with its equipment and consumables summarized as text, plus one structured `BorrowedItems` row for every item. IDs are generated server-side, for example `LOG-20260909-0001` and `BI-000001`.

Units are free text and may be any nonblank value. New departments are `CAHP`, `CNAM`, `JHS`, and `SHS`.

## Setup and deployment

1. Create or select the Google Spreadsheet and copy its ID from the URL.
2. Open **Extensions -> Apps Script** and paste [Code.gs](Code.gs).
3. Set `CONFIG.SPREADSHEET_ID` to the intended production spreadsheet ID. This ID is application configuration, not an authentication credential.
4. Run `setupDatabase()` once and authorize it. It creates and formats missing sheets, including frozen/styled header rows, text/number/date formats, and the `Asia/Manila` spreadsheet timezone.
5. Run `getDatabaseStatus()` and confirm both sheets exist and have valid headers.
6. Deploy **New deployment -> Web app**, execute as **Me**, and select access appropriate for the intended users.
7. Copy the deployed `/exec` URL into `API_URL` in [index.html](index.html), then publish the static repository through GitHub Pages. No build step is required.

## API

- `GET ?action=health` — health response.
- `GET ?action=list` — borrower logs with their structured borrowed items; supports `department`, `faculty`, `from`, and `to` filters.
- `GET ?action=stats` — totals and item usage grouped by item and canonical unit.
- `POST` includes `equipment` and `consumables` arrays of `{ "itemName", "quantity", "unit" }`.

Quantities may be decimal but must be finite, positive, and within the configured maximum. Each nonblank item row requires all three fields. Each submission is validated before writing; `LockService` and rollback protect the linked log/item write as one logical transaction.

Reports use the structured `items` data returned by `list`, not serialized text. They display quantities by item and unit, and deliberately do not combine incompatible units. The code has a future conversion boundary, but does not currently convert `mL` to `L`, `mg` to `g`, or `g` to `kg`.

## Legacy data

The prior serialized `BorrowerLogs` format is not automatically migrated. If it already exists, `setupDatabase()` preserves it unchanged and reports that migration is required; it will not overwrite, reorder, or guess data. This includes historical `JHS/SHS` records, which must not be reassigned to JHS or SHS without a manual, reviewed migration.

## Privacy

The Web App access setting governs who can submit and read logs. The `/exec` URL is not a secret, so use an access policy appropriate for the borrower data and do not publish the spreadsheet to the web.
