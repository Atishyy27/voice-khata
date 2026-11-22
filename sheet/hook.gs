/**
 * Voice Khata demo-sheet hook. Standalone Apps Script (not bound to a sheet).
 *
 * setup() builds the "Voice Khata - Demo Ledger" spreadsheet once and stores its id in the
 * script property SHEET_ID. doPost appends validated rows to its "Entries" tab, under the
 * last row, inside a script lock. Invalid rows are dropped; the reply says how many were written.
 *
 * Deploy (manual, not done by this file): Deploy > New deployment > Web app. Execute as: Me.
 * Who has access: Anyone. The deployment URL is a secret and is kept on the server only
 * (Vercel env SHEET_HOOK_URL), never in this file or in git.
 *
 * Entries columns: A Date | B Time | C Customer | D Type | E Amount | F Signed | G Note | H Entry ID | I Session
 */

var MAX_ROWS = 20;
var MAX_AMOUNT = 10000000;

var SEED = [
  ['2026-10-05', '10:15', 'Ramesh Sharma', 'udhaar', 1200, 1200, 'shaadi ke liye kapda', 'seed-1', 'demo-seed'],
  ['2026-10-20', '18:40', 'Ramesh Sharma', 'jama', 500, -500, '', 'seed-2', 'demo-seed'],
  ['2026-11-18', '11:05', 'Ramesh Doodhwala', 'udhaar', 340, 340, 'doodh ka hisaab', 'seed-3', 'demo-seed'],
  ['2026-09-28', '09:30', 'Sita', 'udhaar', 2000, 2000, 'diwali ka saaman', 'seed-4', 'demo-seed'],
  ['2026-11-21', '17:10', 'Mohan', 'udhaar', 800, 800, 'cheeni, chawal', 'seed-5', 'demo-seed'],
  ['2026-11-22', '09:45', 'Mohan', 'jama', 300, -300, '', 'seed-6', 'demo-seed'],
  ['2026-11-10', '12:00', 'Pinky', 'udhaar', 450, 450, 'school copy', 'seed-7', 'demo-seed'],
  ['2026-11-15', '16:20', 'Anil', 'udhaar', 650, 650, 'atta', 'seed-8', 'demo-seed'],
  ['2026-11-19', '19:00', 'Anil', 'jama', 650, -650, '', 'seed-9', 'demo-seed'],
  ['2026-11-22', '10:30', 'Ramesh Doodhwala', 'udhaar', 430, 430, '', 'seed-10', 'demo-seed']
];

function setup() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty('SHEET_ID');
  if (existingId) {
    try {
      var existing = SpreadsheetApp.openById(existingId);
      Logger.log(existing.getUrl());
      return existing.getUrl();
    } catch (err) {}
  }

  var ss = SpreadsheetApp.create('Voice Khata - Demo Ledger');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId()); // saved first, so a failed run never makes a second sheet
  ss.setSpreadsheetTimeZone('Asia/Kolkata');
  var entries = ss.getSheets()[0].setName('Entries');
  ['Receivables', 'Aging', 'Top dues', 'Trends', 'How to use'].forEach(function (name) {
    ss.insertSheet(name);
  });
  var receivables = ss.getSheetByName('Receivables');
  var aging = ss.getSheetByName('Aging');
  var top = ss.getSheetByName('Top dues');
  var trends = ss.getSheetByName('Trends');
  var howTo = ss.getSheetByName('How to use');

  entries.getRange('B:B').setNumberFormat('@');
  entries.getRange(1, 1, 1, 9).setValues([['Date', 'Time', 'Customer', 'Type', 'Amount', 'Signed', 'Note', 'Entry ID', 'Session']]);
  var seedRows = SEED.map(function (s) {
    return [Utilities.parseDate(s[0], 'Asia/Kolkata', 'yyyy-MM-dd'), s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8]];
  });
  entries.getRange(2, 1, seedRows.length, 9).setValues(seedRows);

  receivables.getRange(1, 1, 1, 7).setValues([['Customer', 'Given (udhaar)', 'Received (jama)', 'Baaki', 'First entry', 'Last payment', 'Age (days)']]);
  receivables.getRange('A2').setFormula('=SORT(UNIQUE(FILTER(Entries!C2:C, Entries!C2:C<>"")))');
  receivables.getRange('B2').setFormula('=ARRAYFORMULA(IF(A2:A="",,SUMIFS(Entries!E2:E,Entries!C2:C,A2:A,Entries!D2:D,"udhaar")))');
  receivables.getRange('C2').setFormula('=ARRAYFORMULA(IF(A2:A="",,SUMIFS(Entries!E2:E,Entries!C2:C,A2:A,Entries!D2:D,"jama")))');
  receivables.getRange('D2').setFormula('=ARRAYFORMULA(IF(A2:A="",,B2:B-C2:C))');
  receivables.getRange('E2').setFormula('=MAP(A2:A, LAMBDA(c, IF(c="","",MINIFS(Entries!A2:A, Entries!C2:C, c))))');
  receivables.getRange('F2').setFormula('=MAP(A2:A, LAMBDA(c, IF(c="","",IF(MAXIFS(Entries!A2:A, Entries!C2:C, c, Entries!D2:D, "jama")=0,"-",MAXIFS(Entries!A2:A, Entries!C2:C, c, Entries!D2:D, "jama")))))');
  receivables.getRange('G2').setFormula('=MAP(A2:A, E2:E, F2:F, LAMBDA(c,e,f, IF(c="","",TODAY()-IF(f="-",e,f))))');

  aging.getRange(1, 1, 1, 4).setValues([['Bucket', 'Customers', 'Baaki', 'Share']]);
  aging.getRange('A2:A5').setValues([['0-30 days'], ['31-60 days'], ['60+ days'], ['Total']]);
  aging.getRange('B2').setFormula('=COUNTIFS(Receivables!D2:D,">0",Receivables!G2:G,"<=30")');
  aging.getRange('C2').setFormula('=SUMIFS(Receivables!D2:D,Receivables!D2:D,">0",Receivables!G2:G,"<=30")');
  aging.getRange('B3').setFormula('=COUNTIFS(Receivables!D2:D,">0",Receivables!G2:G,">30",Receivables!G2:G,"<=60")');
  aging.getRange('C3').setFormula('=SUMIFS(Receivables!D2:D,Receivables!D2:D,">0",Receivables!G2:G,">30",Receivables!G2:G,"<=60")');
  aging.getRange('B4').setFormula('=COUNTIFS(Receivables!D2:D,">0",Receivables!G2:G,">60")');
  aging.getRange('C4').setFormula('=SUMIFS(Receivables!D2:D,Receivables!D2:D,">0",Receivables!G2:G,">60")');
  aging.getRange('B5').setFormula('=SUM(B2:B4)');
  aging.getRange('C5').setFormula('=SUM(C2:C4)');
  aging.getRange('D2').setFormula('=IFERROR(C2/$C$5,0)');
  aging.getRange('D3').setFormula('=IFERROR(C3/$C$5,0)');
  aging.getRange('D4').setFormula('=IFERROR(C4/$C$5,0)');
  aging.getRange('D5').setFormula('=SUM(D2:D4)');

  top.getRange(1, 1, 1, 4).setValues([['Customer', 'Baaki', 'Share', 'Cumulative share']]);
  top.getRange('F1').setValue('Customers holding 80% of dues');
  top.getRange('A2').setFormula('=QUERY(Receivables!A2:D, "select A, D where D > 0 order by D desc", 0)');
  top.getRange('C2').setFormula('=ARRAYFORMULA(IF(B2:B="",,B2:B/SUM(B2:B)))');
  top.getRange('D2').setFormula('=ARRAYFORMULA(IF(B2:B="",,SCAN(0,B2:B,LAMBDA(a,x,a+x))/SUM(B2:B)))');
  top.getRange('F2').setFormula('=IFERROR(MATCH(TRUE, ARRAYFORMULA(D2:D>=0.8), 0), "-")');

  trends.getRange(1, 1, 1, 5).setValues([['Date', 'Udhaar given', 'Jama received', 'Net', 'Collection rate']]);
  trends.getRange('A2').setFormula('=SORT(UNIQUE(FILTER(Entries!A2:A, Entries!A2:A<>"")))');
  trends.getRange('B2').setFormula('=ARRAYFORMULA(IF(A2:A="",,SUMIFS(Entries!E2:E,Entries!A2:A,A2:A,Entries!D2:D,"udhaar")))');
  trends.getRange('C2').setFormula('=ARRAYFORMULA(IF(A2:A="",,SUMIFS(Entries!E2:E,Entries!A2:A,A2:A,Entries!D2:D,"jama")))');
  trends.getRange('D2').setFormula('=ARRAYFORMULA(IF(A2:A="",,B2:B-C2:C))');
  trends.getRange('E2').setFormula('=ARRAYFORMULA(IF(A2:A="",,IFERROR(C2:C/B2:B,0)))');
  var chart = trends.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(trends.getRange('A1:C60'))
    .setPosition(2, 7, 0, 0)
    .setOption('title', 'Udhaar vs jama by day')
    .build();
  trends.insertChart(chart);

  howTo.getRange('A1:A4').setValues([
    ['Demo ledger for Voice Khata (BolBharat PS2). Synthetic data only. Entries reach this sheet only when the app toggle "demo sheet" is switched on.'],
    ['Entries is append-only: the app adds rows and never edits them. A correction adds a reversal row and the corrected row.'],
    ['Receivables: what each customer owes and how old it is. Aging: baaki by age bucket. Top dues: the few customers holding most of the money (80/20). Trends: daily udhaar vs jama and the collection rate.'],
    ['Do not type in Entries. Every other tab is formulas.']
  ]);

  entries.getRange('E:F').setNumberFormat('"₹"#,##0');
  entries.getRange('A:A').setNumberFormat('dd mmm yyyy');
  receivables.getRange('B:D').setNumberFormat('"₹"#,##0');
  receivables.getRange('E:F').setNumberFormat('dd mmm yyyy');
  aging.getRange('C:C').setNumberFormat('"₹"#,##0');
  aging.getRange('D:D').setNumberFormat('0.0%');
  top.getRange('B:B').setNumberFormat('"₹"#,##0');
  top.getRange('C:D').setNumberFormat('0.0%');
  trends.getRange('B:D').setNumberFormat('"₹"#,##0');
  trends.getRange('E:E').setNumberFormat('0.0%');
  trends.getRange('A:A').setNumberFormat('dd mmm yyyy');

  SpreadsheetApp.flush();
  var all = [entries, receivables, aging, top, trends, howTo];
  all.forEach(function (sh) {
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, sh.getLastColumn());
  });
  [receivables, aging, top, trends, howTo].forEach(function (sh) {
    sh.protect().setWarningOnly(true);
  });

  DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('SHEET_ID', ss.getId());
  var url = ss.getUrl();
  Logger.log(url);
  return url;
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('run setup first');
  return SpreadsheetApp.openById(id);
}

function doGet(e) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) return json_({ ok: true, url: '' });
  var ss = SpreadsheetApp.openById(id);
  if (!(e && e.parameter && e.parameter.check === '1')) return json_({ ok: true, url: ss.getUrl() });
  return json_({
    ok: true,
    url: ss.getUrl(),
    receivables: display_(ss, 'Receivables', 'A1:G8'),
    aging: display_(ss, 'Aging', 'A1:D5'),
    top: display_(ss, 'Top dues', 'A1:F6'),
    trends: display_(ss, 'Trends', 'A1:E11')
  });
}

function display_(ss, tab, a1) {
  return ss.getSheetByName(tab).getRange(a1).getDisplayValues();
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  var input = body && Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  var values = [];
  input.forEach(function (r) {
    var row = cleanRow_(r);
    if (row) values.push(row);
  });
  if (values.length === 0) return json_({ ok: false, error: 'no valid rows' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var sheet = ss_().getSheetByName('Entries');
    if (!sheet) return json_({ ok: false, error: 'no Entries tab' });
    var start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, values.length, 9).setValues(values);
    return json_({ ok: true, appended: values.length });
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

// Returns one Entries row (9 values) or null when the input row is invalid.
function cleanRow_(r) {
  if (!r || typeof r !== 'object') return null;
  var date = r.date, time = r.time, customer = r.customer, type = r.type;
  var amount = r.amount, signed = r.signed, note = r.note, id = r.id, session = r.session;

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  var when;
  try {
    when = Utilities.parseDate(date, 'Asia/Kolkata', 'yyyy-MM-dd');
  } catch (err) {
    return null;
  }
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (typeof customer !== 'string' || customer.trim() === '' || customer.length > 60) return null;
  if (type !== 'udhaar' && type !== 'jama') return null;
  if (typeof amount !== 'number' || !isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) return null;
  if (typeof signed !== 'number' || !isFinite(signed)) return null;
  if (typeof note !== 'string' || note.length > 120) return null;
  if (typeof id !== 'string' || id === '' || id.length > 64) return null;
  if (typeof session !== 'string' || session.length > 16) return null;

  return [when, time, customer.trim(), type, amount, signed, note, id, session];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
