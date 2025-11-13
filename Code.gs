// Apps Script Code for Laboratory Borrowing System
const SHEET_EQUIP = "Equipment";
const SHEET_CHEM = "Chemicals";

function doGet(e) {
  const params = e.parameter || {};
  if (params.action === "stats") {
    return ContentService.createTextOutput(JSON.stringify(getStats()))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({status:"ok", message:"Laboratory Borrowing API"}))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action || (e.parameter && e.parameter.action) || "";
    if (action === "submit") {
      return handleSubmit(body);
    } else if (action === "return") {
      return handleReturn(body);
    } else {
      return jsonResponse({status:"error", message:"unknown action"}, 400);
    }
  } catch (err) {
    return jsonResponse({status:"error", message: err.message}, 500);
  }
}

function handleSubmit(body) {
  const type = String(body.type || "").toLowerCase();
  const payload = body.payload || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (type === "equipment") {
    const sheet = ss.getSheetByName(SHEET_EQUIP);
    if (!sheet) return jsonResponse({status:"error", message:"Equipment sheet not found"},500);
    const row = [
      new Date(),
      payload.name || "",
      payload.subject || "",
      payload.course || "",
      payload.department || "",
      payload.dateReserved || "",
      payload.dateBorrowed || "",
      payload.equipmentName || "",
      (payload.status || "Borrowed")
    ];
    sheet.appendRow(row);
    return jsonResponse({status:"success", message:"Equipment recorded"});
  } else if (type === "chemical") {
    const sheet = ss.getSheetByName(SHEET_CHEM);
    if (!sheet) return jsonResponse({status:"error", message:"Chemicals sheet not found"},500);
    const row = [
      new Date(),
      payload.facultyName || "",
      payload.dateReserved || "",
      payload.chemicalName || "",
      payload.quantity || "",
      (payload.status || "Used")
    ];
    sheet.appendRow(row);
    return jsonResponse({status:"success", message:"Chemical recorded"});
  } else {
    return jsonResponse({status:"error", message:"Invalid type"},400);
  }
}

function handleReturn(body) {
  const payload = body.payload || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EQUIP);
  if (!sheet) return jsonResponse({status:"error", message:"Equipment sheet not found"},500);

  const name = (payload.name || "").toString().trim().toLowerCase();
  const item = (payload.itemName || "").toString().trim().toLowerCase();
  const dateReturned = payload.dateReturned || new Date();

  const values = sheet.getDataRange().getValues();
  let updated = false;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rowName = (row[1] || "").toString().trim().toLowerCase();
    const rowItem = (row[7] || "").toString().trim().toLowerCase();
    const rowStatus = (row[8] || "").toString().trim().toLowerCase();
    if (rowName === name && rowItem === item && rowStatus !== "returned") {
      sheet.getRange(r + 1, 9).setValue("Returned");
      updated = true;
      break;
    }
  }
  return jsonResponse({status:"success", updated: updated});
}

function getStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const equip = ss.getSheetByName(SHEET_EQUIP);
  const chem = ss.getSheetByName(SHEET_CHEM);

  let equipVals = [];
  let chemVals = [];
  if (equip && equip.getLastRow() > 1) {
    equipVals = equip.getRange(2,1,equip.getLastRow()-1,9).getValues();
  }
  if (chem && chem.getLastRow() > 1) {
    chemVals = chem.getRange(2,1,chem.getLastRow()-1,6).getValues();
  }

  let totalBorrowed = 0;
  let totalReturned = 0;
  const equipCount = {};
  equipVals.forEach(r => {
    const status = (r[8]||"").toString().toLowerCase();
    const item = (r[7]||"").toString().trim().toLowerCase();
    if (status === "borrowed" || status === "") totalBorrowed++;
    if (status === "returned") totalReturned++;
    if (item) equipCount[item] = (equipCount[item] || 0) + 1;
  });
  const mostBorrowedEquipment = getTopKey(equipCount);

  const chemCount = {};
  let totalChemReq = 0;
  chemVals.forEach(r => {
    const item = (r[3]||"").toString().trim().toLowerCase();
    if (item) {
      chemCount[item] = (chemCount[item] || 0) + 1;
      totalChemReq++;
    }
  });
  const mostRequestedChemical = getTopKey(chemCount);

  return {
    equipment: {
      totalBorrowed: totalBorrowed,
      totalReturned: totalReturned,
      mostBorrowedEquipment: mostBorrowedEquipment || null,
      rawCounts: equipCount
    },
    chemicals: {
      totalRequested: totalChemReq,
      mostRequestedChemical: mostRequestedChemical || null,
      rawCounts: chemCount
    },
    credit: "Laboratory Borrowing Management System 2025",
    lastUpdated: new Date()
  };
}

function getTopKey(obj) {
  let top = null;
  let max = 0;
  for (let k in obj) {
    if (obj[k] > max) { max = obj[k]; top = k; }
  }
  return top;
}

function jsonResponse(payload, code) {
  const t = ContentService.createTextOutput(JSON.stringify(payload));
  t.setMimeType(ContentService.MimeType.JSON);
  return t;
}
