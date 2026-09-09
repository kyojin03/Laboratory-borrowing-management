# Laboratory Borrowing Management

A static GitHub Pages application for logging laboratory borrower slips, viewing the logbook, filtering records, producing period reports, exporting CSV, and printing reports.

## Architecture

`GitHub Pages (index.html) -> Google Apps Script Web App -> Google Sheets (BorrowerLogs)`

The browser submits and reads JSON through the deployed Apps Script Web App. The spreadsheet does **not** need to be published to the web, and the frontend no longer submits to Google Forms or loads a published CSV.

## Database setup

Select or create the Google Spreadsheet used for logs. You do not need to create `BorrowerLogs` or type its headers manually. `setupDatabase()` creates the sheet when absent, writes or safely repairs its header row, freezes and styles the header, sizes columns, applies appropriate date/number/text formats, and sets the spreadsheet timezone to `Asia/Manila`.

The database headers are:

```text
Timestamp | Department | FacultyName | GroupsRequested | EquipmentBorrowed | ConsumablesBorrowed | Incident | IncidentDetails
```

The app stores multiple equipment or consumable entries as the current semicolon-separated `Item - quantity` text format. New submissions may use only `CAHP`, `CNAM`, `JHS`, or `SHS`. Existing `JHS/SHS` rows are preserved as legacy records and are never automatically assigned to JHS or SHS.

## Deploy the backend

1. Open the Google Spreadsheet and copy its ID from its URL.
2. Open **Extensions -> Apps Script** and replace the project script with [Code.gs](Code.gs).
3. In `CONFIG`, replace `PUT_SPREADSHEET_ID_HERE` with that spreadsheet ID. Do not commit a real ID to this repository.
4. Save, select `setupDatabase` in the Apps Script function menu, and run it once. Authorize the script when asked.
5. Confirm that `BorrowerLogs` was automatically created, then run `getDatabaseStatus` and inspect its execution log/result.
6. Choose **Deploy -> New deployment -> Web app**.
7. Set **Execute as** to **Me**, and choose access appropriate for the users who must submit and read logs.
8. Deploy and copy the `/exec` URL (not the `/dev` URL).
9. In [index.html](index.html), replace `PUT_APPS_SCRIPT_EXEC_URL_HERE` in `API_URL` with the `/exec` URL.
10. Deploy the static files to GitHub Pages as usual; no build step or dependency installation is needed.

## Test after deployment

1. Open `YOUR_EXEC_URL?action=health`; it should return a JSON `status` of `ok`.
2. Submit one borrower slip and confirm that its timestamp was generated in `BorrowerLogs`.
3. Open `YOUR_EXEC_URL?action=list` and confirm the record is returned.
4. Use **Load / Refresh Data**, filters, reports, CSV export, and printing in the GitHub Pages site.

## API contract

- `GET ?action=health` returns service status and a Manila timestamp.
- `GET ?action=list` returns logs; optional `department`, `faculty`, `from`, and `to` parameters filter server-side.
- `GET ?action=stats` returns record, incident, group, department, and parsed item-use totals.
- `POST` JSON `{ "action": "submit", "payload": { ... } }` validates and appends a borrower slip.

The backend creates timestamps server-side, serializes writes with `LockService`, rejects malformed borrower data, safely stores text that starts with spreadsheet formula characters, and does not expose the spreadsheet ID or server stack traces. API requests only verify that setup is complete; they do not reformat the sheet.

## Repository contents

- `index.html` — GitHub Pages frontend; set `API_URL` after Apps Script deployment.
- `Code.gs` — active Apps Script Web App backend; set `CONFIG.SPREADSHEET_ID` before deployment.
- `GS.png` — logo asset retained from the original package.
- `Laboratory_Borrowing_Management_System_2025.xlsx` — historical workbook from the prior Equipment/Chemicals implementation; not used by the active application.
- `lab_borrowing_package.zip` — archive of an earlier package already represented in Git history; retain only if an offline distribution copy is needed.
- `legacy/Code.old.gs` — marker for the retired Equipment/Chemicals Apps Script architecture; its full original source remains in Git history before this migration.

## Privacy and access

The Web App's access setting controls who can read and submit borrower logs. Because `list` exposes all borrower records to anyone who can reach the deployed endpoint, deploy it only to the intended audience and avoid treating the `/exec` URL as a secret. Do not publish the spreadsheet to the web unless there is a separate, intentional public-data need.
