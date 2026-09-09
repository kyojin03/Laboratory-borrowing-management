/** GSC Laboratory Borrowing Web App API. Configure before deployment. */
const CONFIG = { SPREADSHEET_ID: "1d9qdSVwM8JyNu3WakWAEri4z3AspLYz5iPvsWX1FaG4", TIMEZONE: "Asia/Manila", LOG_SHEET: "BorrowerLogs", BORROWED_ITEMS_SHEET: "BorrowedItems" };
const LOG_HEADERS = ["LogID", "Timestamp", "Department", "FacultyName", "GroupsRequested", "Incident", "IncidentDetails"];
const BORROWED_ITEM_HEADERS = ["ItemLogID", "LogID", "ItemName", "Category", "Quantity", "Unit"];
const VALID_DEPARTMENTS = ["CAHP", "CNAM", "JHS", "SHS"];
const MAX_LENGTHS = { facultyName: 200, incidentDetails: 2000, itemName: 300, unit: 100 };
const MAX_QUANTITY = 1000000;

/** One-time administrator setup. It never converts or removes legacy data. */
function setupDatabase() {
  const spreadsheet = getSpreadsheet_();
  spreadsheet.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  const results = [
    setupSheet_(spreadsheet, CONFIG.LOG_SHEET, LOG_HEADERS, formatLogSheet_),
    setupSheet_(spreadsheet, CONFIG.BORROWED_ITEMS_SHEET, BORROWED_ITEM_HEADERS, formatBorrowedItemsSheet_)
  ];
  const status = getDatabaseStatus();
  status.setup = results;
  status.migrationRequired = results.some(function(result) { return result.migrationRequired; });
  Logger.log(JSON.stringify(status));
  return status;
}

/** Diagnostic helper for the Apps Script editor; never exposed through doGet. */
function getDatabaseStatus() {
  const status = { spreadsheetConnected: false, borrowerLogsExists: false, headersValid: false, numberOfRecords: 0, spreadsheetTimezone: null, sheets: {} };
  try {
    const spreadsheet = getSpreadsheet_();
    status.spreadsheetConnected = true;
    status.spreadsheetTimezone = spreadsheet.getSpreadsheetTimeZone();
    [[CONFIG.LOG_SHEET, LOG_HEADERS], [CONFIG.BORROWED_ITEMS_SHEET, BORROWED_ITEM_HEADERS]].forEach(function(definition) {
      const sheet = spreadsheet.getSheetByName(definition[0]);
      const headersValid = Boolean(sheet) && headersAreValid_(sheet, definition[1]);
      status.sheets[definition[0]] = { exists: Boolean(sheet), headersValid: headersValid, records: headersValid ? Math.max(0, sheet.getLastRow() - 1) : null };
    });
    const logs = status.sheets[CONFIG.LOG_SHEET];
    status.borrowerLogsExists = logs.exists; status.headersValid = logs.headersValid; status.numberOfRecords = logs.records;
  } catch (error) { status.error = "Database configuration could not be verified. Check Apps Script logs for details."; console.error(error); }
  Logger.log(JSON.stringify(status));
  return status;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    switch (String(params.action || "health").toLowerCase()) {
      case "health": return jsonResponse({ status: "ok", service: "GSC Laboratory Borrowing API", timestamp: timestampString_(new Date()) });
      case "list": return jsonResponse({ status: "success", data: listLogs_(params) });
      case "stats": return jsonResponse({ status: "success", data: calculateStats_(readLogs_(), readBorrowedItems_()) });
      default: return errorResponse_("UNKNOWN_ACTION", "Unsupported action.");
    }
  } catch (error) { return handleServerError_(error); }
}
function doPost(e) { try { const body = parseRequestBody_(e); return String(body.action || "").toLowerCase() === "submit" ? submitLog_(body.payload) : errorResponse_("UNKNOWN_ACTION", "Unsupported action."); } catch (error) { return handleServerError_(error); } }

function submitLog_(payload) {
  const lock = LockService.getScriptLock(); let logSheet, itemSheet, logRow = 0, itemStartRow = 0, itemCount = 0;
  try {
    lock.waitLock(30000);
    const database = ensureDatabase_();
    const validated = validateSubmission_(payload);
    if (validated.error) return errorResponse_("VALIDATION_ERROR", validated.error);
    logSheet = database.logs; itemSheet = database.borrowedItems;
    const now = new Date(), logId = nextLogId_(logSheet, now);
    const itemRows = validated.items.map(function(item) { return [nextItemLogId_(itemSheet), logId, item.itemName, item.category, item.quantity, item.unit]; });
    // All validation occurs before writing. The script lock and rollback make this a logical transaction.
    logRow = logSheet.getLastRow() + 1;
    logSheet.getRange(logRow, 1, 1, LOG_HEADERS.length).setValues([[logId, now, validated.department, validated.facultyName, validated.groupsRequested, validated.incident, validated.incidentDetails]]);
    itemStartRow = itemSheet.getLastRow() + 1; itemCount = itemRows.length;
    itemSheet.getRange(itemStartRow, 1, itemCount, BORROWED_ITEM_HEADERS.length).setValues(itemRows);
    return jsonResponse({ status: "success", message: "Borrower slip recorded.", logId: logId });
  } catch (error) {
    rollbackSubmission_(logSheet, logRow, itemSheet, itemStartRow, itemCount);
    console.error(error && error.stack ? error.stack : error);
    return errorResponse_("WRITE_ERROR", "Unable to record the borrower slip. Please try again.");
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}

function listLogs_(params) {
  let logs = readLogs_();
  const department = normalizeText_(params.department, 20).toUpperCase(), faculty = normalizeText_(params.faculty, MAX_LENGTHS.facultyName).toLowerCase(), from = parseDateParam_(params.from, false), to = parseDateParam_(params.to, true);
  if (department) logs = logs.filter(function(log) { return log.Department === department; });
  if (faculty) logs = logs.filter(function(log) { return log.FacultyName.toLowerCase().indexOf(faculty) !== -1; });
  if (from) logs = logs.filter(function(log) { return new Date(log.Timestamp) >= from; });
  if (to) logs = logs.filter(function(log) { return new Date(log.Timestamp) <= to; });
  const itemMap = groupItemsByLog_(readBorrowedItems_());
  return logs.map(function(log) { log.items = itemMap[log.LogID] || []; return log; });
}
function readLogs_() { const sheet = ensureDatabase_().logs; if (sheet.getLastRow() < 2) return []; return sheet.getRange(2, 1, sheet.getLastRow() - 1, LOG_HEADERS.length).getValues().map(function(row) { return { LogID: String(row[0] || ""), Timestamp: row[1] instanceof Date ? timestampString_(row[1]) : String(row[1] || ""), Department: String(row[2] || ""), FacultyName: String(row[3] || ""), GroupsRequested: String(row[4] || ""), Incident: String(row[5] || ""), IncidentDetails: String(row[6] || "") }; }); }
function readBorrowedItems_() { const sheet = ensureDatabase_().borrowedItems; if (sheet.getLastRow() < 2) return []; return sheet.getRange(2, 1, sheet.getLastRow() - 1, BORROWED_ITEM_HEADERS.length).getValues().map(function(row) { return { ItemLogID: String(row[0] || ""), LogID: String(row[1] || ""), ItemName: String(row[2] || ""), Category: String(row[3] || ""), Quantity: Number(row[4]) || 0, Unit: String(row[5] || "") }; }); }

function validateSubmission_(payload) {
  if (!payload || typeof payload !== "object") return { error: "A submission payload is required." };
  const department = normalizeText_(payload.department, 20).toUpperCase(), facultyName = safeSheetText_(normalizeText_(payload.facultyName, MAX_LENGTHS.facultyName)), groupsRequested = payload.groupsRequested === "" || payload.groupsRequested == null ? "" : Number(payload.groupsRequested), incident = normalizeText_(payload.incident, 3).toLowerCase(), incidentDetails = safeSheetText_(normalizeText_(payload.incidentDetails, MAX_LENGTHS.incidentDetails));
  if (VALID_DEPARTMENTS.indexOf(department) === -1) return { error: "Department must be CAHP, CNAM, JHS, or SHS." };
  if (!facultyName) return { error: "Faculty name is required." };
  if (groupsRequested !== "" && (!isFinite(groupsRequested) || groupsRequested <= 0 || groupsRequested > MAX_QUANTITY)) return { error: "Groups requested must be a positive number within the allowed range." };
  if (incident !== "yes" && incident !== "no") return { error: "Incident must be yes or no." };
  if (incident === "yes" && !incidentDetails) return { error: "Incident details are required when incident is yes." };
  const items = [];
  [[payload.equipment, "Equipment"], [payload.consumables, "Consumable"]].forEach(function(section) {
    if (section[0] != null && !Array.isArray(section[0])) throw new Error("Invalid item section.");
    (section[0] || []).forEach(function(raw) {
      const itemName = safeSheetText_(normalizeText_(raw && raw.itemName, MAX_LENGTHS.itemName));
      let unit = safeSheetText_(normalizeText_(raw && raw.unit, MAX_LENGTHS.unit));
      const quantity = Number(raw && raw.quantity);
      const isEquipment = section[1] === "Equipment";
      if (!itemName || (!isEquipment && !unit) || !isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY || (isEquipment && Math.floor(quantity) !== quantity)) throw new Error(isEquipment ? "Each equipment item requires a name and positive whole-number quantity." : "Each consumable item requires a name, positive finite quantity, and unit.");
      if (isEquipment) unit = "";
      items.push({ itemName: itemName, category: section[1], quantity: quantity, unit: unit });
    });
  });
  if (!items.length) return { error: "At least one borrowed item is required." };
  return { department: department, facultyName: facultyName, groupsRequested: groupsRequested, incident: incident, incidentDetails: incidentDetails, items: items };
}
function calculateStats_(logs, borrowedItems) { const counts = { CAHP: 0, CNAM: 0, JHS: 0, SHS: 0, "Legacy JHS/SHS": 0 }; let incidents = 0, groups = 0; logs.forEach(function(log) { const department = log.Department === "JHS/SHS" ? "Legacy JHS/SHS" : log.Department; counts[department] = (counts[department] || 0) + 1; if (String(log.Incident).toLowerCase() === "yes") incidents++; groups += Number(log.GroupsRequested) || 0; }); return { totalRecords: logs.length, totalIncidents: incidents, groupsRequestedSum: groups, departmentCounts: counts, itemUsage: aggregateItems_(borrowedItems) }; }
function aggregateItems_(items) { const totals = {}; items.forEach(function(item) { const name = normalizeText_(item.ItemName, MAX_LENGTHS.itemName), unit = normalizeText_(item.Unit, MAX_LENGTHS.unit), key = [name.toLowerCase(), item.Category, unit.toLowerCase()].join("|"); if (!totals[key]) totals[key] = { itemName: name, category: item.Category, unit: unit, quantity: 0 }; totals[key].quantity += Number(item.Quantity) || 0; }); return Object.keys(totals).map(function(key) { return totals[key]; }).sort(function(a, b) { return b.quantity - a.quantity || a.itemName.localeCompare(b.itemName); }); }

function ensureDatabase_() { const spreadsheet = getSpreadsheet_(); return { logs: requireSheet_(spreadsheet, CONFIG.LOG_SHEET, LOG_HEADERS), borrowedItems: requireSheet_(spreadsheet, CONFIG.BORROWED_ITEMS_SHEET, BORROWED_ITEM_HEADERS) }; }
function setupSheet_(spreadsheet, name, headers, formatter) { let sheet = spreadsheet.getSheetByName(name); const created = !sheet; if (!sheet) sheet = spreadsheet.insertSheet(name); const header = ensureHeaders_(sheet, headers); if (header.valid) formatter(sheet); return { sheet: name, created: created, headersCreated: header.created, headersRepaired: header.repaired, headersValid: header.valid, migrationRequired: !header.valid }; }
function requireSheet_(spreadsheet, name, headers) { const sheet = spreadsheet.getSheetByName(name); if (!sheet) throw new Error(name + " has not been set up. Run setupDatabase() first."); if (!headersAreValid_(sheet, headers)) throw new Error(name + " has incompatible headers. Migration is required before API use."); return sheet; }
function headersAreValid_(sheet, headers) { return sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].map(String).join("|") === headers.join("|"); }
function ensureHeaders_(sheet, headers) { if (headersAreValid_(sheet, headers)) return { valid: true, created: false, repaired: false }; const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].map(String); if (sheet.getLastRow() <= 1) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return { valid: true, created: true, repaired: false }; } if (!current.every(function(value, index) { return !value || value === headers[index]; })) return { valid: false, created: false, repaired: false }; sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return { valid: true, created: false, repaired: true }; }
function formatHeader_(sheet, headers) { sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0B3D91").setFontColor("#FFFFFF"); sheet.setFrozenRows(1); sheet.autoResizeColumns(1, headers.length); }
function formatLogSheet_(sheet) { formatHeader_(sheet, LOG_HEADERS); const rows = Math.max(1, sheet.getMaxRows() - 1); sheet.getRange(2, 2, rows, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss"); sheet.getRange(2, 5, rows, 1).setNumberFormat("0.##"); [1, 3, 4, 6, 7].forEach(function(column) { sheet.getRange(2, column, rows, 1).setNumberFormat("@"); }); }
function formatBorrowedItemsSheet_(sheet) { formatHeader_(sheet, BORROWED_ITEM_HEADERS); const rows = Math.max(1, sheet.getMaxRows() - 1); sheet.getRange(2, 5, rows, 1).setNumberFormat("0.########"); [1, 2, 3, 4, 6].forEach(function(column) { sheet.getRange(2, column, rows, 1).setNumberFormat("@"); }); }
function nextLogId_(sheet, date) { const day = Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyyMMdd"), key = "logCounter:" + day, prefix = "LOG-" + day + "-", last = Number(PropertiesService.getScriptProperties().getProperty(key)) || findLargestId_(sheet, 1, new RegExp("^" + prefix + "(\\d+)$")), next = last + 1; PropertiesService.getScriptProperties().setProperty(key, String(next)); return prefix + ("0000" + next).slice(-4); }
function nextItemLogId_(sheet) { const key = "borrowedItemCounter", last = Number(PropertiesService.getScriptProperties().getProperty(key)) || findLargestId_(sheet, 1, /^BI-(\d+)$/), next = last + 1; PropertiesService.getScriptProperties().setProperty(key, String(next)); return "BI-" + ("000000" + next).slice(-6); }
function findLargestId_(sheet, column, pattern) { if (sheet.getLastRow() < 2) return 0; return sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues().reduce(function(max, row) { const match = String(row[0]).match(pattern); return match ? Math.max(max, Number(match[1])) : max; }, 0); }
function rollbackSubmission_(logSheet, logRow, itemSheet, itemStartRow, itemCount) { try { if (itemSheet && itemStartRow && itemCount && itemSheet.getLastRow() >= itemStartRow + itemCount - 1) itemSheet.deleteRows(itemStartRow, itemCount); if (logSheet && logRow && logSheet.getLastRow() >= logRow) logSheet.deleteRow(logRow); } catch (error) { console.error("Submission rollback failed: " + error); } }
function groupItemsByLog_(items) { return items.reduce(function(result, item) { (result[item.LogID] = result[item.LogID] || []).push(item); return result; }, {}); }
function getSpreadsheet_() { if (CONFIG.SPREADSHEET_ID === "PUT_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID has not been configured."); return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function parseRequestBody_(e) { if (!e || !e.postData || !e.postData.contents) throw new Error("Request body is missing."); return JSON.parse(e.postData.contents); }
function parseDateParam_(value, endOfDay) { if (!value) return null; const date = new Date(String(value) + (String(value).length === 10 ? (endOfDay ? "T23:59:59.999+08:00" : "T00:00:00+08:00") : "")); return isNaN(date.getTime()) ? null : date; }
function normalizeText_(value, maxLength) { return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength); }
function safeSheetText_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function timestampString_(date) { return Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function jsonResponse(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function errorResponse_(code, message) { return jsonResponse({ status: "error", code: code, message: message }); }
function handleServerError_(error) { console.error(error && error.stack ? error.stack : error); return errorResponse_("SERVER_ERROR", "The service could not complete the request."); }
