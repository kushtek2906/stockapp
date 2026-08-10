import type { AppPrefs } from "./prefs";
import type { PriceUpdate } from "./pricebook";

export interface PublishResult {
  ok: boolean;
  written?: number;
  skipped?: string[];
  error?: string;
}

/**
 * POST price updates to the user's Apps Script web app. Uses text/plain so the
 * browser skips the CORS preflight (Apps Script web apps don't answer OPTIONS).
 */
export async function publishPrices(
  scriptUrl: string,
  updates: PriceUpdate[],
): Promise<PublishResult> {
  if (scriptUrl.trim() === "") {
    return { ok: false, error: "No publish URL configured." };
  }
  try {
    const res = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ updates }),
      redirect: "follow",
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as PublishResult;
    } catch {
      return { ok: res.ok, error: res.ok ? undefined : text.slice(0, 200) };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." };
  }
}

/**
 * The Apps Script the user pastes into their sheet (Extensions → Apps Script)
 * and deploys as a web app. Baked with their sheet IDs so it's copy-paste ready.
 * Writes 3/5/10ml to the customer sheet and 30ml to the internal hidden tab,
 * matching rows by normalized brand + perfume.
 */
export function buildAppsScript(prefs: AppPrefs): string {
  return `// DECANTVERSE — price write-back. Deploy: Deploy > New deployment >
// type "Web app", execute as "Me", access "Anyone with the link". Copy the /exec URL.
var CUSTOMER_SHEET_ID = '${prefs.sheetId}';
var CUSTOMER_GID = '${prefs.sheetGid}';
var THIRTY_SHEET_ID = '${prefs.prices30SheetId}';
var THIRTY_GID = '${prefs.prices30Gid}';

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function sheetByGid(id, gid) {
  var ss = SpreadsheetApp.openById(id);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(gid)) return sheets[i];
  }
  return sheets[0];
}

function doPost(e) {
  var out = { ok: true, written: 0, skipped: [] };
  try {
    var updates = (JSON.parse(e.postData.contents).updates) || [];
    var cache = {};
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      var toThirty = Number(u.size) === 30;
      var id = toThirty ? THIRTY_SHEET_ID : CUSTOMER_SHEET_ID;
      var gid = toThirty ? THIRTY_GID : CUSTOMER_GID;
      var ck = id + '|' + gid;
      if (!cache[ck]) {
        var sh = sheetByGid(id, gid);
        cache[ck] = { sheet: sh, vals: sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues() };
      }
      var sheet = cache[ck].sheet, vals = cache[ck].vals;
      var hdr = vals[0].map(norm);
      var bCol = hdr.indexOf('brand'), pCol = hdr.indexOf('perfume');
      var szCol = hdr.indexOf(u.size + 'ml');
      if (szCol < 0 || pCol < 0) { out.skipped.push(u.perfume + ' ' + u.size + 'ml'); continue; }
      var wanted = norm((u.brand || '') + ' ' + u.perfume), wantedP = norm(u.perfume), row = -1;
      for (var r = 1; r < vals.length; r++) {
        var pv = norm(vals[r][pCol]), bv = bCol >= 0 ? norm(vals[r][bCol]) : '';
        if (norm(bv + ' ' + pv) === wanted || pv === wantedP) { row = r + 1; break; }
      }
      if (row < 0) { out.skipped.push(u.perfume + ' ' + u.size + 'ml'); continue; }
      sheet.getRange(row, szCol + 1).setValue(u.price);
      out.written++;
    }
  } catch (err) { out.ok = false; out.error = String(err); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
