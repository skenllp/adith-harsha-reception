/**
 * Google Apps Script — saves RSVPs into a Google Sheet.
 * See README.md for the 2-minute setup.
 */
var SHEET_NAME = 'RSVPs';
var SECRET = '';   // optional: same value as RSVP_WEBHOOK_SECRET in Vercel

function doPost(e) {
  var out = function (o) {
    return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  };
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var d = JSON.parse(e.postData.contents);
    if (SECRET && d.secret !== SECRET) return out({ ok: false, error: 'forbidden' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Received (UTC)', 'Submission ID', 'Name', 'Attending', 'Guests', 'Contact', 'Message']);
      sh.setFrozenRows(1);
    }
    // ignore a repeat of the same submission id (double tap / retry)
    if (d.id) {
      var ids = sh.getRange(2, 2, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] === d.id) return out({ ok: true, duplicate: true });
    }
    // prefix with ' so Sheets never treats text as a formula
    var safe = function (v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; };
    sh.appendRow([d.receivedAt, d.id, safe(d.name), d.attending, d.guests, safe(d.phone), safe(d.message)]);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
