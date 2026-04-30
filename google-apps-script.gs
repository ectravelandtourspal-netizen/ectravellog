/*  ══════════════════════════════════════════════════════════
    google-apps-script.gs
    ──────────────────────────────────────────────────────────
    SHEET LAYOUT
    ─ Row 4  : Column headers  (A – R)
    ─ Row 5+ : Data rows

    Column map
    A  Start Date        B  End Date          C  No. of Days
    D  No. of Guests     E  Boat Name          F  Route
    G  Lead Tour Guide   H  Asst. Tour Guide   I  Chef
    J  Boat Crew (1st)   K  Boat Crew (2nd)    L  Fire Dancer
    M  Add. Position 1   N  Add. Name 1
    O  Add. Position 2   P  Add. Name 2
    Q  Add. Position 3   R  Add. Name 3

    Extra sheets:
    ─ "admin"    : A1=username, B1=password
    ─ "rates"    : A=Position,  B=Rate per day
    ─ "payments" : A=StaffName B=Position C=StartDate D=Route
                   E=Boat      F=Days     G=Guests    H=Rate
                   I=Total     J=Paid(0/1) K=PaidDate
    ──────────────────────────────────────────────────────────
    HOW TO DEPLOY:
    1. Open https://script.google.com → New Project
    2. Paste this entire file into the editor
    3. Set SHEET_ID below (from your Google Sheet URL)
    4. Save → Deploy → New Deployment → Web App
       Execute as: Me | Who has access: Anyone
    5. Copy the Web App URL into docs/script.js as GAS_URL
══════════════════════════════════════════════════════════ */

var SHEET_ID       = '19bDdztKuh04v4WDelM2Vp1YmO2aMced6-3FLK5U5mkc';
var SHEET_NAME     = 'trip details';
var HEADER_ROW     = 4;
var DATA_START_ROW = 5;

// ── Default rates per day (₱) — override in the "rates" sheet
var DEFAULT_RATES = {
  'lead tour guide':  800,
  'asst. tour guide': 600,
  'chef':             600,
  'asst. chef':       500,
  'boat crew':        500,
  'fire dancer':      500,
  'other':            400,
};

// ══════════════════════════════════════════════════════════
// doPost
// ══════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var params;
    if (e.parameter && e.parameter.payload) {
      params = JSON.parse(e.parameter.payload);
    } else {
      params = JSON.parse(e.postData.contents);
    }
    if (params.action === 'addTrip')         return addTrip(params);
    if (params.action === 'markPaid')        return markPaid(params);
    if (params.action === 'adminLogin')      return adminLogin(params);
    if (params.action === 'addCashAdvance')  return addCashAdvance(params);
    if (params.action === 'officeTimeIn')    return officeTimeIn(params);
    if (params.action === 'markOfficePaid')  return markOfficePaid(params);
    return jsonResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

// ══════════════════════════════════════════════════════════
// doGet
// ══════════════════════════════════════════════════════════
function doGet(e) {
  try {
    // When a browser POSTs to GAS, the 302 redirect converts it to a GET.
    // The payload query param is preserved, so handle write actions here too.
    if (e.parameter && e.parameter.payload) {
      var params = JSON.parse(e.parameter.payload);
      if (params.action === 'addTrip')        return addTrip(params);
      if (params.action === 'markPaid')       return markPaid(params);
      if (params.action === 'adminLogin')     return adminLogin(params);
      if (params.action === 'addCashAdvance') return addCashAdvance(params);
      if (params.action === 'officeTimeIn')   return officeTimeIn(params);
      if (params.action === 'markOfficePaid')  return markOfficePaid(params);
    }
    var action = e.parameter.action;
    if (action === 'getTrips')              return getTrips();
    if (action === 'getStaffBalances')      return getStaffBalances();
    if (action === 'getStaffDetail')        return getStaffDetail(e.parameter.name);
    if (action === 'getRates')              return getRates();
    if (action === 'getCashAdvances')       return getCashAdvances(e.parameter.name);
    if (action === 'getStaffNames')         return getStaffNames();
    if (action === 'getOfficeAttendance')   return getOfficeAttendance(e.parameter.date);
    if (action === 'getOfficeSalaryReport') return getOfficeSalaryReport(e.parameter);
    return jsonResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

// ══════════════════════════════════════════════════════════
// adminLogin — checks "admin" sheet A1/B1
// ══════════════════════════════════════════════════════════
function adminLogin(params) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('admin');
  if (!sheet) return jsonResponse({ success: false, message: 'Admin sheet not found' });
  var storedUser = String(sheet.getRange('A1').getValue()).trim();
  var storedPass = String(sheet.getRange('B1').getValue()).trim();
  if (params.username === storedUser && params.password === storedPass) {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: false, message: 'Invalid username or password' });
}

// ══════════════════════════════════════════════════════════
// getRates — reads "rates" sheet
// Layout: Row 1 = headers
//   A=Staff Name, B=Lead Tour Guide, C=Asst. Tour Guide,
//   D=Chef, E=Asst. Chef, F=Boat Crew, G=Fire Dancer
// Returns: { rates: { positionKey: defaultRate, ... },
//            staffRates: [ { name, rates: { posKey: rate } } ] }
// ══════════════════════════════════════════════════════════
function getRates() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('rates');
  var rates = JSON.parse(JSON.stringify(DEFAULT_RATES)); // clone defaults
  var staffRates = [];

  if (sheet && sheet.getLastRow() >= 2) {
    // Row 1 is header; data starts at row 2
    var headers = sheet.getRange(1, 1, 1, 7).getValues()[0];
    // headers[0]=Name, [1]=Lead Tour Guide, [2]=Asst. Tour Guide,
    // [3]=Chef, [4]=Asst. Chef, [5]=Boat Crew, [6]=Fire Dancer
    var posKeys = [
      'lead tour guide',
      'asst. tour guide',
      'chef',
      'asst. chef',
      'boat crew',
      'fire dancer'
    ];
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    data.forEach(function(row) {
      var name = String(row[0]).trim();
      if (!name) return;
      var personRates = {};
      posKeys.forEach(function(key, i) {
        var val = Number(row[i + 1]);
        if (val > 0) {
          rates[key] = val; // last row wins for global default
          personRates[key] = val;
        }
      });
      staffRates.push({ name: name, rates: personRates });
    });
  }

  return jsonResponse({ success: true, rates: rates, staffRates: staffRates });
}

// ══════════════════════════════════════════════════════════
// getStaffNames — returns list of staff names from "rates" sheet col A (row 2+)
// ══════════════════════════════════════════════════════════
function getStaffNames() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('rates');
  var names = [];
  if (sheet && sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    data.forEach(function(row) {
      var n = String(row[0]).trim();
      if (n) names.push(n);
    });
  }
  return jsonResponse({ success: true, names: names });
}

// ══════════════════════════════════════════════════════════
// addTrip — writes trip row + creates payment records
// ══════════════════════════════════════════════════════════
function addTrip(data) {
  var sheet   = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  var newRow  = (lastRow < DATA_START_ROW) ? DATA_START_ROW : lastRow + 1;

  var row = [
    data.startDate     || '',
    data.endDate       || '',
    data.days          || '',
    data.guests        || '',
    data.boat          || '',
    data.route         || '',
    data.leadTourGuide || '',
    data.asstTourGuide || '',
    data.chef          || '',
    data.boatCrew1     || '',
    data.boatCrew2     || '',
    data.fireDancer    || '',
    data.add1Position  || '',
    data.add1Name      || '',
    data.add2Position  || '',
    data.add2Name      || '',
    data.add3Position  || '',
    data.add3Name      || '',
  ];
  sheet.getRange(newRow, 1, 1, row.length).setValues([row]);

  // ── Create payment records for every named staff member
  var ratesData = {};
  var ratesObj  = {};
  var staffRates = [];
  try {
    var ratesRaw = JSON.parse(getRates().getContent());
    ratesObj   = ratesRaw.rates   || {};
    staffRates = ratesRaw.staffRates || [];
  } catch(e) {}
  var staff = buildStaffList(data);
  staff.forEach(function(s) { writePaymentRecord(data, s, ratesObj, staffRates); });

  return jsonResponse({ success: true, message: 'Trip added' });
}

// ── Build flat list [{name, position}] from the mapped data object
function buildStaffList(data) {
  var list = [];
  function add(name, position) {
    if (name && String(name).trim()) list.push({ name: String(name).trim(), position: position });
  }
  add(data.leadTourGuide, 'Lead Tour Guide');
  add(data.asstTourGuide, 'Asst. Tour Guide');
  add(data.chef,          'Chef');
  add(data.boatCrew1,     'Boat Crew');
  add(data.boatCrew2,     'Boat Crew');
  add(data.fireDancer,    'Fire Dancer');
  if (data.add1Name) add(data.add1Name, data.add1Position || 'Other');
  if (data.add2Name) add(data.add2Name, data.add2Position || 'Other');
  if (data.add3Name) add(data.add3Name, data.add3Position || 'Other');
  return list;
}

// ── Write one row to the "payments" sheet
function writePaymentRecord(tripData, staffMember, rates, staffRates) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('payments');
  if (!sheet) {
    sheet = ss.insertSheet('payments');
    sheet.getRange(1, 1, 1, 11).setValues([[
      'Staff Name','Position','Start Date','Route','Boat',
      'Days','Guests','Rate/Day','Total Salary','Paid','Paid Date'
    ]]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  }
  var posKey = staffMember.position.toLowerCase().trim();

  // Look up this specific person's rate for this position first
  var rate = null;
  if (staffRates && staffRates.length) {
    var nameLower = staffMember.name.toLowerCase().trim();
    staffRates.forEach(function(sr) {
      if (String(sr.name).toLowerCase().trim() === nameLower) {
        if (sr.rates && sr.rates[posKey]) rate = sr.rates[posKey];
      }
    });
  }
  // Fall back to global position default, then hardcoded default
  if (!rate) rate = (rates && rates[posKey]) || (rates && rates['other']) || 400;
  var days   = Number(tripData.days) || 0;
  var total  = rate * days;
  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, 11).setValues([[
    staffMember.name,
    staffMember.position,
    tripData.startDate || '',
    tripData.route     || '',
    tripData.boat      || '',
    days,
    Number(tripData.guests) || 0,
    rate,
    total,
    0,   // Paid = 0 (unpaid)
    '',  // Paid Date
  ]]);
}

// ══════════════════════════════════════════════════════════
// getStaffBalances — unique staff with outstanding balance
// ══════════════════════════════════════════════════════════
function getStaffBalances() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('payments');
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, staff: [] });
  }
  var data  = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  var map   = {};
  data.forEach(function(row) {
    var paid = Number(row[9]);
    if (paid === 1) return; // already paid — skip
    var name = String(row[0]).trim();
    if (!name) return;
    if (!map[name]) map[name] = { name: name, totalOwed: 0, tripCount: 0 };
    map[name].totalOwed  += Number(row[8]) || 0;
    map[name].tripCount  += 1;
  });
  var staff = Object.values(map).sort(function(a,b){ return a.name.localeCompare(b.name); });
  return jsonResponse({ success: true, staff: staff });
}

// ══════════════════════════════════════════════════════════
// getStaffDetail — all unpaid payment rows + outstanding advances
// ══════════════════════════════════════════════════════════
function getStaffDetail(name) {
  if (!name) return jsonResponse({ success: false, message: 'No name provided' });
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('payments');
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, records: [], advances: [] });
  }
  var data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  var records = [];
  data.forEach(function(row, idx) {
    if (String(row[0]).trim() !== name.trim()) return;
    if (Number(row[9]) === 1) return; // already paid
    records.push({
      rowIndex:  idx + 2,
      staffName: row[0],
      position:  row[1],
      startDate: row[2] instanceof Date
                   ? Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'yyyy-MM-dd')
                   : String(row[2]),
      route:     row[3],
      boat:      row[4],
      days:      row[5],
      guests:    row[6],
      ratePerDay: row[7],
      total:     row[8],
    });
  });

  // ── Fetch outstanding (not yet deducted) cash advances for this staff
  var advances = [];
  var advSheet = ss.getSheetByName('advances');
  if (advSheet && advSheet.getLastRow() >= 2) {
    var advData = advSheet.getRange(2, 1, advSheet.getLastRow() - 1, 6).getValues();
    advData.forEach(function(row, idx) {
      if (String(row[1]).trim() !== name.trim()) return;
      if (Number(row[4]) === 1) return; // already deducted
      advances.push({
        rowIndex: idx + 2,
        date:     row[0] instanceof Date
                    ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd')
                    : String(row[0]),
        amount:   Number(row[2]) || 0,
        notes:    row[3] || '',
      });
    });
  }

  return jsonResponse({ success: true, records: records, advances: advances });
}

// ══════════════════════════════════════════════════════════
// addCashAdvance — write to "advances" sheet
// ══════════════════════════════════════════════════════════
function addCashAdvance(params) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('advances');
  if (!sheet) {
    sheet = ss.insertSheet('advances');
    sheet.getRange(1, 1, 1, 6).setValues([[
      'Date', 'Staff Name', 'Amount (\u20b1)', 'Notes', 'Deducted', 'Deducted Date'
    ]]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3a124').setFontColor('#fff');
  }
  var today = params.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([
    today,
    params.staffName || '',
    Number(params.amount) || 0,
    params.notes   || '',
    0,  // Deducted = 0
    '',
  ]);
  return jsonResponse({ success: true, message: 'Cash advance recorded' });
}

// ══════════════════════════════════════════════════════════
// getCashAdvances — all outstanding advances for one staff
// ══════════════════════════════════════════════════════════
function getCashAdvances(name) {
  if (!name) return jsonResponse({ success: false, message: 'No name provided' });
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('advances');
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, advances: [] });
  }
  var data     = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  var advances = [];
  data.forEach(function(row, idx) {
    if (String(row[1]).trim() !== name.trim()) return;
    if (Number(row[4]) === 1) return; // already deducted
    advances.push({
      rowIndex: idx + 2,
      date:     row[0] instanceof Date
                  ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd')
                  : String(row[0]),
      amount:   Number(row[2]) || 0,
      notes:    row[3] || '',
    });
  });
  return jsonResponse({ success: true, advances: advances });
}

// ══════════════════════════════════════════════════════════
// markPaid — mark specific payment rows as paid + log to admin sheet
// params.rowIndexes = array of 1-based sheet row numbers
// params.amountPaid = actual cash given by admin
// params.staffName  = staff name
// params.totalOwed  = computed total owed (from salary table)
// ══════════════════════════════════════════════════════════
function markPaid(params) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('payments');
  if (!sheet) return jsonResponse({ success: false, message: 'Payments sheet not found' });

  var today   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var indexes = params.rowIndexes || [];

  // ── Mark rows as paid + collect remarks ──────────────
  var tripLines = [];
  indexes.forEach(function(r) {
    var rowNum = Number(r);
    if (!rowNum || rowNum < 2) return;
    try {
      var vals = sheet.getRange(rowNum, 1, 1, 9).getValues()[0];
      var startDate = '';
      try {
        if (vals[2]) {
          var d = vals[2] instanceof Date ? vals[2] : new Date(String(vals[2]));
          startDate = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
      } catch(de) {}
      var line = [
        startDate ? 'Date: '     + startDate : '',
        vals[3]   ? 'Route: '    + vals[3]   : '',
        vals[4]   ? 'Boat: '     + vals[4]   : '',
        vals[5]   ? 'Days: '     + vals[5]   : '',
        vals[6]   ? 'Guests: '   + vals[6]   : '',
        vals[1]   ? 'Position: ' + vals[1]   : '',
        vals[8]   ? '₱'          + vals[8]   : '',
      ].filter(Boolean).join(' | ');
      if (line) tripLines.push(line);
    } catch(re) {}

    sheet.getRange(rowNum, 10).setValue(1);     // Paid = 1
    sheet.getRange(rowNum, 11).setValue(today); // Paid Date
  });

  // Flush payment writes immediately so they are committed
  SpreadsheetApp.flush();

  var remarks = tripLines.join('\n');

  // ── Mark cash advances as deducted ───────────────────
  var advSheet   = ss.getSheetByName('advances');
  var advIndexes = params.advanceRowIndexes || [];
  if (advSheet && advIndexes.length > 0) {
    advIndexes.forEach(function(r) {
      var rowNum = Number(r);
      if (!rowNum || rowNum < 2) return;
      advSheet.getRange(rowNum, 5).setValue(1);
      advSheet.getRange(rowNum, 6).setValue(today);
    });
    SpreadsheetApp.flush();
  }

  // ── Log to admin sheet (non-fatal) ───────────────────
  try {
    var adminSheet = ss.getSheetByName('admin');
    if (adminSheet) {
      var headerCell = adminSheet.getRange(3, 1).getValue();
      if (!headerCell || String(headerCell).trim() === '') {
        adminSheet.getRange(3, 1, 1, 8).setValues([[
          'Date Paid','Staff Name','Amount Given (₱)','Total Owed (₱)','Deduction (₱)','Trips Paid','Remarks','Notes'
        ]]);
        adminSheet.getRange(3, 1, 1, 8).setFontWeight('bold');
      }
      adminSheet.appendRow([
        today,
        params.staffName  || '',
        params.amountPaid !== undefined ? Number(params.amountPaid) : '',
        params.totalOwed  !== undefined ? Number(params.totalOwed)  : '',
        params.deduction  ? Number(params.deduction) : 0,
        indexes.length + ' record' + (indexes.length !== 1 ? 's' : ''),
        remarks,
        params.notes || ''
      ]);
      SpreadsheetApp.flush();
    }
  } catch(logErr) {
    Logger.log('Admin log error (non-fatal): ' + logErr.message);
  }

  return jsonResponse({ success: true, message: 'Marked as paid' });
}

// ══════════════════════════════════════════════════════════
// getTrips
// ══════════════════════════════════════════════════════════
function getTrips() {
  var sheet   = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    return jsonResponse({ success: true, trips: [] });
  }
  var numRows = lastRow - DATA_START_ROW + 1;
  var data    = sheet.getRange(DATA_START_ROW, 1, numRows, 18).getValues();
  var trips = data.map(function(row) {
    function fmtDate(v) {
      if (!v) return '';
      if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      return String(v).split('T')[0];
    }
    return {
      date: fmtDate(row[0]),  endDate: fmtDate(row[1]),
      days: row[2],  guests: row[3],  boat: row[4],  route: row[5],
      teamLeader: row[6],  asstTourGuide: row[7],  chef: row[8],
      boatCrew1:  row[9],  boatCrew2:    row[10], fireDancer: row[11],
      add1Position: row[12], add1Name: row[13],
      add2Position: row[14], add2Name: row[15],
      add3Position: row[16], add3Name: row[17],
    };
  });
  trips.reverse();
  return jsonResponse({ success: true, trips: trips });
}

// ══════════════════════════════════════════════════════════
// getOrCreateSheet
// ══════════════════════════════════════════════════════════
function getOrCreateSheet() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  var headerRange = sheet.getRange(HEADER_ROW, 1, 1, 18);
  var existing    = headerRange.getValues()[0];
  if (!existing.some(function(v){ return v !== ''; })) {
    headerRange.setValues([[
      'Start Date','End Date','No. of Days','No. of Guests',
      'Boat Name','Route','Lead Tour Guide','Asst. Tour Guide','Chef',
      'Boat Crew','Boat Crew','Fire Dancer',
      'Position (Add.1)','Name (Add.1)',
      'Position (Add.2)','Name (Add.2)',
      'Position (Add.3)','Name (Add.3)',
    ]]);
    headerRange.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sheet.setFrozenRows(HEADER_ROW);
  }
  return sheet;
}

// ══════════════════════════════════════════════════════════
// Helper
// ══════════════════════════════════════════════════════════
function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ══════════════════════════════════════════════════════════
// officeTimeIn — writes one row to "office staff" sheet
// Columns: Date | Name | Position | Time In | Location
// ══════════════════════════════════════════════════════════
function officeTimeIn(params) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('office staff');
  if (!sheet) {
    sheet = ss.insertSheet('office staff');
    sheet.getRange(1, 1, 1, 5).setValues([[
      'Date', 'Name', 'Position', 'Time In', 'Location'
    ]]);
    sheet.getRange(1, 1, 1, 5)
      .setFontWeight('bold')
      .setBackground('#1a73e8')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  // Data starts at row 3 (row 2 left as a visual spacer)
  var newRow = Math.max(sheet.getLastRow() + 1, 3);
  // Force date cell to plain-text format so Sheets never auto-converts the
  // '2026-05-01' string into a Date serial — avoids timezone-shift mismatches
  sheet.getRange(newRow, 1).setNumberFormat('@');
  sheet.getRange(newRow, 1, 1, 5).setValues([[
    params.date     || '',
    params.name     || '',
    params.position || '',
    params.time     || '',
    params.location || '',
  ]]);
  SpreadsheetApp.flush();
  return jsonResponse({ success: true, message: 'Time in recorded' });
}

// ══════════════════════════════════════════════════════════
// getOfficeAttendance — returns all rows from "office staff"
// sheet where Date matches the requested date (yyyy-MM-dd)
// ══════════════════════════════════════════════════════════
function getOfficeAttendance(date) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('office staff');
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ success: true, records: [] });
  }
  var tz          = Session.getScriptTimeZone();
  var targetDate  = String(date).trim();
  // Read from row 2 for backward-compat (pre-fix data may sit at row 2)
  var numRows = sheet.getLastRow() - 1;
  var data    = sheet.getRange(2, 1, numRows, 5).getValues();
  var records = [];
  data.forEach(function(row) {
    var stored = row[0];
    if (!stored && stored !== 0) return; // skip blank rows
    var rowDate;
    if (stored instanceof Date) {
      // Date object: compare in script TZ; also try UTC as fallback for
      // misconfigured script timezones
      var inTz  = Utilities.formatDate(stored, tz,    'yyyy-MM-dd');
      var inUtc = Utilities.formatDate(stored, 'UTC', 'yyyy-MM-dd');
      rowDate = (inTz === targetDate || inUtc === targetDate) ? targetDate : inTz;
    } else {
      // Plain text (new records stored with @-format)
      rowDate = String(stored).trim().substring(0, 10);
    }
    if (rowDate !== targetDate) return;
    records.push({
      date:     rowDate,
      name:     String(row[1]).trim(),
      position: String(row[2]).trim(),
      time:     String(row[3]).trim(),
      location: String(row[4]).trim(),
    });
  });
  return jsonResponse({ success: true, records: records });
}

// ══════════════════════════════════════════════════════════// getOfficeRates — reads "office_rates" sheet (A=Name, B=Daily Rate)
// Create this sheet manually: Name in col A, daily rate in col B, row 1 = headers
// ════════════════════════════════════════════════════════
function getOfficeRates() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('office_rates');
  var map   = {};
  if (sheet && sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    data.forEach(function(row) {
      var name = String(row[0]).trim().toLowerCase();
      var rate = Number(row[1]) || 0;
      if (name) map[name] = rate;
    });
  }
  return map;
}

// ════════════════════════════════════════════════════════
// getOfficeSalaryReport — counts days worked per staff in pay period,
// looks up rates, fetches outstanding cash advances, returns full summary.
// params: year, month (1-based), period (1 = 1st-15th, 2 = 16th-end)
// ════════════════════════════════════════════════════════
function getOfficeSalaryReport(params) {
  var year     = Number(params.year);
  var month    = Number(params.month);
  var period   = Number(params.period);
  var startDay = period === 1 ? 1 : 16;
  var endDay   = period === 1 ? 15 : new Date(year, month, 0).getDate();

  // Build lookup set of yyyy-MM-dd strings for the period
  var dateSet = {};
  for (var d = startDay; d <= endDay; d++) {
    var key = year + '-' + String(month).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    dateSet[key] = true;
  }

  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('office staff');
  var tz    = Session.getScriptTimeZone();
  var staffMap = {};

  if (sheet && sheet.getLastRow() >= 2) {
    var numAttRows = sheet.getLastRow() - 1;
    var attData = sheet.getRange(2, 1, numAttRows, 5).getValues();
    attData.forEach(function(row) {
      var stored  = row[0];
      if (!stored && stored !== 0) return;
      var rowDate;
      if (stored instanceof Date) {
        var inTz  = Utilities.formatDate(stored, tz,    'yyyy-MM-dd');
        var inUtc = Utilities.formatDate(stored, 'UTC', 'yyyy-MM-dd');
        rowDate = dateSet[inTz] ? inTz : inUtc;
      } else {
        rowDate = String(stored).trim().substring(0, 10);
      }
      if (!dateSet[rowDate]) return; // outside pay period
      var position = String(row[2]).trim();
      if (!name) return;
      var nameKey = name.toLowerCase();
      if (!staffMap[nameKey]) staffMap[nameKey] = { name: name, position: position, daysSet: {} };
      staffMap[nameKey].daysSet[rowDate] = true; // distinct dates only
    });
  }

  var rates    = getOfficeRates();
  var advSheet = ss.getSheetByName('advances');
  var allAdv   = [];
  if (advSheet && advSheet.getLastRow() >= 2) {
    var advData = advSheet.getRange(2, 1, advSheet.getLastRow() - 1, 6).getValues();
    advData.forEach(function(row, idx) {
      if (Number(row[4]) === 1) return; // already deducted
      var aName = String(row[1]).trim();
      if (!aName) return;
      allAdv.push({
        rowIndex: idx + 2,
        name:     aName,
        date:     row[0] instanceof Date ? Utilities.formatDate(row[0], tz, 'yyyy-MM-dd') : String(row[0]).trim(),
        amount:   Number(row[2]) || 0,
        notes:    String(row[3] || '').trim(),
      });
    });
  }

  var result = Object.keys(staffMap).map(function(nameKey) {
    var s            = staffMap[nameKey];
    var rate         = rates[nameKey] || 0;
    var days         = Object.keys(s.daysSet).length;
    var salary       = rate * days;
    var staffAdv     = allAdv.filter(function(a) { return a.name.toLowerCase() === nameKey; });
    var totalAdvances = staffAdv.reduce(function(sum, a) { return sum + a.amount; }, 0);
    return {
      name:          s.name,
      position:      s.position,
      days:          days,
      ratePerDay:    rate,
      salary:        salary,
      advances:      staffAdv,
      totalAdvances: totalAdvances,
      net:           salary - totalAdvances,
    };
  });

  result.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return jsonResponse({ success: true, staff: result });
}

// ════════════════════════════════════════════════════════
// markOfficePaid — records payment in "office_payroll" sheet
// and marks any deducted advances in "advances" sheet.
// ════════════════════════════════════════════════════════
function markOfficePaid(params) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var sheet = ss.getSheetByName('office_payroll');
  if (!sheet) {
    sheet = ss.insertSheet('office_payroll');
    sheet.getRange(1, 1, 1, 10).setValues([[
      'Date Paid','Name','Position','Period','Days','Rate/Day','Salary','Deductions','Net Paid','Notes'
    ]]);
    sheet.getRange(1, 1, 1, 10)
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    today,
    params.name      || '',
    params.position  || '',
    params.period    || '',
    Number(params.days)       || 0,
    Number(params.ratePerDay) || 0,
    Number(params.salary)     || 0,
    Number(params.deductions) || 0,
    Number(params.net)        || 0,
    params.notes || '',
  ]);
  SpreadsheetApp.flush();

  var advSheet   = ss.getSheetByName('advances');
  var advIndexes = params.advanceRowIndexes || [];
  if (advSheet && advIndexes.length > 0) {
    advIndexes.forEach(function(r) {
      var rowNum = Number(r);
      if (!rowNum || rowNum < 2) return;
      advSheet.getRange(rowNum, 5).setValue(1);
      advSheet.getRange(rowNum, 6).setValue(today);
    });
    SpreadsheetApp.flush();
  }
  return jsonResponse({ success: true, message: 'Office payment recorded' });
}

// ════════════════════════════════════════════════════════// backfillPayments — RUN THIS ONCE from the GAS editor
// Creates payment records for all existing trips in
// "trip details" that don't already have a payment entry.
// ══════════════════════════════════════════════════════════
function backfillPayments() {
  var tripSheet = getOrCreateSheet();
  var lastRow   = tripSheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    Logger.log('No trip data found.');
    return;
  }

  var ratesObj = {};
  var staffRates = [];
  try {
    var ratesRaw = JSON.parse(getRates().getContent());
    ratesObj   = ratesRaw.rates   || {};
    staffRates = ratesRaw.staffRates || [];
  } catch(e) {}

  var rows = tripSheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 18).getValues();
  var count = 0;

  rows.forEach(function(row) {
    var data = {
      startDate:     row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(row[0]),
      endDate:       row[1] instanceof Date ? Utilities.formatDate(row[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(row[1]),
      days:          row[2],
      guests:        row[3],
      boat:          row[4],
      route:         row[5],
      leadTourGuide: row[6],
      asstTourGuide: row[7],
      chef:          row[8],
      boatCrew1:     row[9],
      boatCrew2:     row[10],
      fireDancer:    row[11],
      add1Position:  row[12], add1Name: row[13],
      add2Position:  row[14], add2Name: row[15],
      add3Position:  row[16], add3Name: row[17],
    };

    if (!data.startDate) return; // skip blank rows

    var staff = buildStaffList(data);
    staff.forEach(function(s) {
      writePaymentRecord(data, s, ratesObj, staffRates);
      count++;
    });
  });

  Logger.log('Backfill complete. Created ' + count + ' payment records.');
}
