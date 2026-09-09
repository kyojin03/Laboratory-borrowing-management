/**
 * GSC Laboratory Borrowing Web App API.
 * Set SPREADSHEET_ID before deploying. Never return it to API clients.
 */
const CONFIG = {
  SPREADSHEET_ID: "PUT_SPREADSHEET_ID_HERE",
  LOG_SHEET: "BorrowerLogs",
  TIMEZONE: "Asia/Manila"
};

const HEADERS = [
  "Timestamp", "Department", "FacultyName", "GroupsRequested",
  "EquipmentBorrowed", "ConsumablesBorrowed", "Incident", "IncidentDetails"
];
const VALID_DEPARTMENTS = ["CAHP", "CNAM", "JHS", "SHS"];
const MAX_LENGTHS = { facultyName: 200, groupsRequested: 20, equipmentBorrowed: 5000, consumablesBorrowed: 5000, incidentDetails: 2000 };

/**
 * One-time administrator setup. Creates and formats BorrowerLogs without
 * deleting records. Run manually from the Apps Script editor after setting
 * CONFIG.SPREADSHEET_ID.
 */
function setupDatabase() {
  const spreadsheet = getSpreadsheet_();
  spreadsheet.setSpreadsheetTimeZone(CONFIG.TIMEZONE);

  let sheet = spreadsheet.getSheetByName(CONFIG.LOG_SHEET);
  const created = !sheet;
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.LOG_SHEET);

  const headerResult = ensureHeaders_(sheet);
  if (!headerResult.valid) {
    const status = getDatabaseStatus();
    status.created = created;
    status.message = "BorrowerLogs was not reformatted because its existing header row is not safe to repair automatically.";
    Logger.log(JSON.stringify(status));
    return status;
  }

  formatDatabaseSheet_(sheet);
  const status = getDatabaseStatus();
  status.created = created;
  status.headersCreated = headerResult.created;
  status.headersRepaired = headerResult.repaired;
  Logger.log(JSON.stringify(status));
  return status;
}

/** Returns diagnostic information for an Apps Script administrator only. */
function getDatabaseStatus() {
  const status = { spreadsheetConnected: false, borrowerLogsExists: false, headersValid: false, numberOfRecords: 0, spreadsheetTimezone: null };
  try {
    const spreadsheet = getSpreadsheet_();
    status.spreadsheetConnected = true;
    status.spreadsheetTimezone = spreadsheet.getSpreadsheetTimeZone();
    const sheet = spreadsheet.getSheetByName(CONFIG.LOG_SHEET);
    status.borrowerLogsExists = Boolean(sheet);
    if (sheet) {
      status.headersValid = headersAreValid_(sheet);
      status.numberOfRecords = Math.max(0, sheet.getLastRow() - (status.headersValid ? 1 : 0));
    }
  } catch (error) {
    status.error = "Database configuration could not be verified. Check Apps Script logs for details.";
    console.error(error);
  }
  Logger.log(JSON.stringify(status));
  return status;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    switch (String(params.action || "health").toLowerCase()) {
      case "health": return jsonResponse({ status: "ok", service: "GSC Laboratory Borrowing API", timestamp: timestampString(new Date()) });
      case "list": return listLogs(params);
      case "stats": return jsonResponse({ status: "success", data: calculateStats(readLogs()) });
      default: return errorResponse("UNKNOWN_ACTION", "Unsupported action.");
    }
  } catch (error) {
    return handleServerError(error);
  }
}

function doPost(e) {
  try {
    const body = parseRequestBody(e);
    if (String(body.action || "").toLowerCase() !== "submit") return errorResponse("UNKNOWN_ACTION", "Unsupported action.");
    return submitLog(body.payload);
  } catch (error) {
    return handleServerError(error);
  }
}

function submitLog(payload) {
  const normalized = validatePayload(payload);
  if (normalized.error) return errorResponse("VALIDATION_ERROR", normalized.error);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const sheet = getLogSheet();
    sheet.appendRow([new Date(), normalized.department, normalized.facultyName, normalized.groupsRequested, normalized.equipmentBorrowed, normalized.consumablesBorrowed, normalized.incident, normalized.incidentDetails]);
    return jsonResponse({ status: "success", message: "Borrower slip recorded." });
  } catch (error) {
    console.error(error);
    return errorResponse("WRITE_ERROR", "Unable to record the borrower slip. Please try again.");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function listLogs(params) {
  let records = readLogs();
  const department = normalizeText(params.department, 20).toUpperCase();
  const faculty = normalizeText(params.faculty, MAX_LENGTHS.facultyName).toLowerCase();
  const from = parseDateParam(params.from, false);
  const to = parseDateParam(params.to, true);
  if (department) records = records.filter(function(record) { return record.Department === department; });
  if (faculty) records = records.filter(function(record) { return record.FacultyName.toLowerCase().indexOf(faculty) !== -1; });
  if (from) records = records.filter(function(record) { return new Date(record.Timestamp) >= from; });
  if (to) records = records.filter(function(record) { return new Date(record.Timestamp) <= to; });
  return jsonResponse({ status: "success", data: records });
}

function readLogs() {
  const sheet = getLogSheet();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues().map(function(row) {
    return {
      Timestamp: row[0] instanceof Date ? timestampString(row[0]) : String(row[0] || ""),
      Department: String(row[1] || ""), FacultyName: String(row[2] || ""),
      GroupsRequested: String(row[3] || ""), EquipmentBorrowed: String(row[4] || ""),
      ConsumablesBorrowed: String(row[5] || ""), Incident: String(row[6] || ""), IncidentDetails: String(row[7] || "")
    };
  });
}

function getLogSheet() {
  return ensureDatabase_();
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return { error: "A submission payload is required." };
  const department = normalizeText(payload.department, 20).toUpperCase();
  const facultyName = safeSheetText(normalizeText(payload.facultyName, MAX_LENGTHS.facultyName));
  const groupsRequested = normalizeText(payload.groupsRequested, MAX_LENGTHS.groupsRequested);
  const equipmentBorrowed = safeSheetText(normalizeText(payload.equipmentBorrowed, MAX_LENGTHS.equipmentBorrowed));
  const consumablesBorrowed = safeSheetText(normalizeText(payload.consumablesBorrowed, MAX_LENGTHS.consumablesBorrowed));
  const incident = normalizeText(payload.incident, 3).toLowerCase();
  const incidentDetails = safeSheetText(normalizeText(payload.incidentDetails, MAX_LENGTHS.incidentDetails));
  if (VALID_DEPARTMENTS.indexOf(department) === -1) return { error: "Department must be CAHP, CNAM, JHS, or SHS." };
  if (!facultyName) return { error: "Faculty name is required." };
  if (!equipmentBorrowed && !consumablesBorrowed) return { error: "Enter equipment or consumables." };
  if (groupsRequested && (!/^\d+(?:\.\d+)?$/.test(groupsRequested) || Number(groupsRequested) <= 0)) return { error: "Groups requested must be blank or a positive number." };
  if (incident !== "yes" && incident !== "no") return { error: "Incident must be yes or no." };
  if (incident === "yes" && !incidentDetails) return { error: "Incident details are required when incident is yes." };
  return { department: department, facultyName: facultyName, groupsRequested: groupsRequested, equipmentBorrowed: equipmentBorrowed, consumablesBorrowed: consumablesBorrowed, incident: incident, incidentDetails: incidentDetails };
}

function calculateStats(records) {
  const departmentCounts = { CAHP: 0, CNAM: 0, JHS: 0, SHS: 0, "Legacy JHS/SHS": 0 };
  let totalIncidents = 0, groupsRequestedSum = 0;
  records.forEach(function(record) { const department = record.Department === "JHS/SHS" ? "Legacy JHS/SHS" : record.Department; departmentCounts[department] = (departmentCounts[department] || 0) + 1; if (record.Incident.toLowerCase() === "yes") totalIncidents++; groupsRequestedSum += Number(record.GroupsRequested) || 0; });
  const equipment = aggregateItems(records, "EquipmentBorrowed");
  const consumables = aggregateItems(records, "ConsumablesBorrowed");
  return { totalRecords: records.length, totalIncidents: totalIncidents, groupsRequestedSum: groupsRequestedSum, departmentCounts: departmentCounts, equipmentQuantityTotal: equipment.total, consumablesQuantityTotal: consumables.total, mostUsedEquipment: equipment.top, mostUsedConsumable: consumables.top };
}

function aggregateItems(records, field) {
  const counts = {}, names = {}; let total = 0;
  records.forEach(function(record) { parseItems(record[field]).forEach(function(item) { counts[item.key] = (counts[item.key] || 0) + item.qty; names[item.key] = names[item.key] || item.name; total += item.qty; }); });
  let top = null; Object.keys(counts).forEach(function(key) { if (!top || counts[key] > top.quantity) top = { name: names[key], quantity: counts[key] }; });
  return { total: total, top: top };
}

function parseItems(text) { return String(text || "").split(/[;\n]+/).map(function(part) { const match = part.trim().match(/^(.+?)(?:\s*[-:=]\s*)(\d+(?:\.\d+)?)/); const name = (match ? match[1] : part).trim(); return name ? { name: name, key: name.toLowerCase().replace(/\s+/g, " "), qty: match ? Number(match[2]) : 1 } : null; }).filter(Boolean); }
function getSpreadsheet_() { if (CONFIG.SPREADSHEET_ID === "PUT_SPREADSHEET_ID_HERE") throw new Error("SPREADSHEET_ID has not been configured."); return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function ensureDatabase_() { const sheet = getSpreadsheet_().getSheetByName(CONFIG.LOG_SHEET); if (!sheet) throw new Error("BorrowerLogs has not been set up. Run setupDatabase() from Apps Script first."); if (!headersAreValid_(sheet)) throw new Error("BorrowerLogs headers are invalid. Review getDatabaseStatus() before using the API."); return sheet; }
function headersAreValid_(sheet) { return sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0].map(String).join("|") === HEADERS.join("|"); }
function ensureHeaders_(sheet) {
  if (headersAreValid_(sheet)) return { valid: true, created: false, repaired: false };
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0].map(String);
  if (sheet.getLastRow() <= 1) { sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]); return { valid: true, created: true, repaired: false }; }
  const safeToRepair = current.every(function(value, index) { return !value || value === HEADERS[index]; });
  if (!safeToRepair) return { valid: false, created: false, repaired: false };
  const repaired = current.some(function(value, index) { return value !== HEADERS[index]; });
  if (repaired) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return { valid: true, created: false, repaired: repaired };
}
function formatDatabaseSheet_(sheet) {
  const header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setFontWeight("bold").setBackground("#0B3D91").setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  sheet.getRange(2, 1, rows, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange(2, 4, rows, 1).setNumberFormat("0.##");
  [5, 6, 8].forEach(function(column) { sheet.getRange(2, column, rows, 1).setNumberFormat("@"); });
  sheet.autoResizeColumns(1, HEADERS.length);
}
function parseRequestBody(e) { if (!e || !e.postData || !e.postData.contents) throw new Error("Request body is missing."); return JSON.parse(e.postData.contents); }
function parseDateParam(value, endOfDay) { if (!value) return null; const date = new Date(String(value) + (String(value).length === 10 ? (endOfDay ? "T23:59:59.999" : "T00:00:00") : "")); return isNaN(date.getTime()) ? null : date; }
function normalizeText(value, maxLength) { return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength); }
function safeSheetText(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function timestampString(date) { return Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function jsonResponse(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function errorResponse(code, message) { return jsonResponse({ status: "error", code: code, message: message }); }
function handleServerError(error) { console.error(error && error.stack ? error.stack : error); return errorResponse("SERVER_ERROR", "The service could not complete the request."); }
