/**
 * Wedding Planner — Google Apps Script backend.
 * Paste this into a script bound to your Google Sheet (Extensions → Apps Script),
 * run setupSheet() once, then Deploy → New deployment → Web app,
 * "Execute as: Me", "Who has access: Anyone". See SETUP.md.
 *
 * API:
 *   GET  ?g=TOKEN     → guest info + current answer + places left
 *   GET  ?site=1      → public site texts (couple names, dates, places) from Config
 *   GET  ?admin=KEY   → full dump for the dashboard
 *   POST (JSON body)  → create/update a response (24h edit window, capacity lock)
 *
 * Personal data (names, dates, venues) lives ONLY in the Sheet, never in the
 * public repo: fill the site_* keys in the Config tab (see SETUP.md).
 */

var GUEST_HEADERS = ["token", "name", "contact", "vip", "gender", "invit_hammam", "invit_soiree", "city", "country", "importance", "lang", "plus_one", "places"];
var RESP_HEADERS = ["token", "timestamp", "phase", "names", "bretagne", "tunisia", "party_size",
  "early_arrival", "hammam", "soiree", "city", "country", "note", "editable_until", "geo_lat", "geo_lng"];

// ---------- one-time setup ----------
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTab(ss, "Guests", GUEST_HEADERS);
  ensureTab(ss, "Responses", RESP_HEADERS);
  var cfg = ensureTab(ss, "Config", ["key", "value"]);
  if (cfg.getLastRow() < 2) {
    cfg.getRange(2, 1, 4, 2).setValues([
      ["phase", "poll"],
      ["capacity_bretagne", 80],
      ["capacity_tunis", 120],
      ["admin_key", Utilities.getUuid().slice(0, 8)]
    ]);
  }
  // three test guests, remove them once real ones are in
  var g = ss.getSheetByName("Guests");
  if (g.getLastRow() < 2) {
    g.getRange(2, 1, 3, GUEST_HEADERS.length).setValues([
      ["test-reg-fr", "Testeur France", "", false, "M", false, false, "Rennes", "France", "", "", false, 1],
      ["test-reg-tn", "Testeuse Tunisie", "", false, "F", true, true, "Tunis", "Tunisie", "", "", true, 1],
      ["test-vip", "Couple VIP", "", true, "F", true, true, "Berlin", "Germany", "", "en", true, 2]
    ]);
  }
}

function ensureTab(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  return sh;
}

// Create (once) the "Timeline" tab Wafa & Lorenzo edit like a board:
// one row per moment — date, description FR, description EN, photo (Drive link).
function setupTimelineTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureTab(ss, "Timeline", TIMELINE_HEADERS);
  if (sh.getLastRow() < 2) {
    sh.getRange(2, 1, 2, TIMELINE_HEADERS.length).setValues([
      ["2025-03-16", "16 mars 2025", "March 16, 2025", "Notre rencontre à Berlin", "We met in Berlin", ""],
      ["2027-06-12", "12 juin 2027", "June 12, 2027", "Notre mariage", "Our wedding", ""]
    ]);
  }
  sh.setColumnWidth(2, 150); sh.setColumnWidth(4, 240); sh.setColumnWidth(5, 240); sh.setColumnWidth(6, 380);
  sh.getRange(1, 1, 1, TIMELINE_HEADERS.length).setBackground("#f0ebe0");
}

// Simple trigger: whenever someone edits the Guests tab (e.g. adds a guest),
// missing tokens are filled automatically — no manual step needed.
function onEdit(e) {
  try {
    if (!e || !e.range || e.range.getSheet().getName() !== "Guests") return;
    generateTokens();
  } catch (err) { /* never block the edit */ }
}

// Fill a random short token for every guest row that has none.
function generateTokens() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Guests");
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var toks = sh.getRange(2, 1, n, 1).getValues();
  var names = sh.getRange(2, 2, n, 1).getValues();
  var alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no lookalikes
  for (var i = 0; i < n; i++) {
    // only rows that actually have a guest name (formulas can extend getLastRow)
    if (!toks[i][0] && String(names[i][0]).trim()) {
      var s = "";
      for (var j = 0; j < 8; j++) s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      toks[i][0] = s;
    }
  }
  sh.getRange(2, 1, n, 1).setValues(toks);
}

// Geocode responses missing lat/lng (Nominatim, 1 req/s). Run manually when needed.
function geocodeResponses() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Responses");
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var data = sh.getRange(2, 1, n, RESP_HEADERS.length).getValues();
  var cCity = RESP_HEADERS.indexOf("city"), cCountry = RESP_HEADERS.indexOf("country");
  var cLat = RESP_HEADERS.indexOf("geo_lat"), cLng = RESP_HEADERS.indexOf("geo_lng");
  for (var i = 0; i < n; i++) {
    if (data[i][cLat] || !data[i][cCity]) continue;
    var q = encodeURIComponent(data[i][cCity] + ", " + data[i][cCountry]);
    try {
      var res = UrlFetchApp.fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + q,
        { headers: { "User-Agent": "wedding-planner-rsvp" }, muteHttpExceptions: true });
      var arr = JSON.parse(res.getContentText());
      if (arr.length) {
        sh.getRange(i + 2, cLat + 1).setValue(arr[0].lat);
        sh.getRange(i + 2, cLng + 1).setValue(arr[0].lon);
      }
    } catch (e) { /* skip, retry next run */ }
    Utilities.sleep(1100);
  }
}

// Timeline schema v2: auto-sorted by an ISO date, up to 3 media (photo/video) per row.
//   sort: YYYY-MM-DD used only for ordering
//   date_fr / date_en: the label shown on the polaroid (auto-filled, editable)
//   media: up to 3 items joined by MEDIA_SEP, each "image:URL" or "video:URL"
var TIMELINE_HEADERS = ["sort", "date_fr", "date_en", "description_fr", "description_en", "media"];
var MEDIA_SEP = " ||| ";

// ---------- helpers ----------
// Turn any Google Drive share link into a URL the browser can display as an image.
function driveImg(url) {
  url = String(url || "").trim();
  if (!url) return "";
  var m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^]*id=)([\w-]{20,})/);
  if (!m) m = url.match(/[?&]id=([\w-]{20,})/);
  return m ? "https://lh3.googleusercontent.com/d/" + m[1] : url;
}
function driveId(url) {
  var m = String(url || "").match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^]*id=)([\w-]{20,})/) ||
          String(url || "").match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : "";
}
function ytId(url) {
  var m = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : "";
}

// The sort cell may come back as a real Date (Sheets auto-parses "2027-06-12").
// Normalise any value to a comparable YYYY-MM-DD string.
function normSort(v) {
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v)) {
    return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2) + "-" + ("0" + v.getDate()).slice(-2);
  }
  return String(v || "").trim();
}

// Parse a free-text date into a sortable YYYY-MM-DD string (best effort).
function toSortDate(s) {
  s = String(s || "").trim();
  var iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  var months = { janvier:1,"février":2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,"août":8,aout:8,septembre:9,octobre:10,novembre:11,"décembre":12,decembre:12,
    january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
  var m = s.toLowerCase().match(/(\d{1,2})\s+([a-zàâäéèêëîïôöûüç]+)\.?\s+(\d{4})/);
  if (m && months[m[2]]) return m[3] + "-" + ("0" + months[m[2]]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  var mo = s.toLowerCase().match(/([a-zàâäéèêëîïôöûüç]+)\.?\s+(\d{4})/);
  if (mo && months[mo[1]]) return mo[2] + "-" + ("0" + months[mo[1]]).slice(-2) + "-00";
  var y = s.match(/(\d{4})/);
  return y ? y[1] + "-00-00" : "9999-99-99"; // undated moments sort to the end
}

// One stored media token ("image:URL" / "video:URL") -> client object.
function mediaToClient(token) {
  token = String(token || "").trim();
  if (!token) return null;
  var type = "image", url = token;
  var c = token.indexOf(":");
  if (token.slice(0, 6) === "image:") { type = "image"; url = token.slice(6); }
  else if (token.slice(0, 6) === "video:") { type = "video"; url = token.slice(6); }
  url = url.trim();
  var y = ytId(url);
  if (y) return { type: "video", kind: "youtube", embed: "https://www.youtube.com/embed/" + y, thumb: "https://i.ytimg.com/vi/" + y + "/hqdefault.jpg" };
  var id = driveId(url);
  if (type === "video") {
    return id ? { type: "video", kind: "drive", embed: "https://drive.google.com/file/d/" + id + "/preview", src: url }
              : { type: "video", kind: "url", src: url };
  }
  return { type: "image", src: driveImg(url) };
}
function parseMedia(cell) {
  return String(cell || "").split(MEDIA_SEP).map(function (t) { return t.trim(); })
    .filter(Boolean).slice(0, 3).map(mediaToClient).filter(Boolean);
}

// Preferred source: the "Timeline" tab, one row per moment, sorted by date.
// Returns { fr:[...], en:[...] } or null if missing/empty.
function readTimeline() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Timeline");
  if (!sh) return null;
  var n = sh.getLastRow() - 1;
  if (n < 1) return null;
  var rows = sh.getRange(2, 1, n, TIMELINE_HEADERS.length).getValues();
  var items = [];
  rows.forEach(function (r) {
    var dFr = String(r[1] || "").trim();
    var media = parseMedia(r[5]);
    var descFr = String(r[3] || "").trim();
    if (!dFr && !descFr && !media.length) return;
    var sort = normSort(r[0]) || toSortDate(dFr);
    items.push({ sort: sort, dateFr: dFr, dateEn: String(r[2] || "").trim() || dFr, descFr: descFr, descEn: String(r[4] || "").trim() || descFr, media: media });
  });
  items.sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
  if (!items.length) return null;
  return {
    fr: items.map(function (it) { return { date: it.dateFr, text: it.descFr, media: it.media }; }),
    en: items.map(function (it) { return { date: it.dateEn, text: it.descEn, media: it.media }; })
  };
}

// Legacy fallback for the old single-cell Config format.
function tl(s) {
  if (!s) return null;
  return String(s).split("||").map(function (item) {
    var f = item.split("~");
    var media = f[2] ? [{ type: "image", src: driveImg(f[2]) }] : [];
    return { date: (f[0] || "").trim(), text: (f[1] || "").trim(), media: media };
  });
}

// One-time migration of the old Timeline schema (date | desc_fr | desc_en | photo)
// to v2. Safe to run repeatedly: it skips if already migrated.
function migrateTimeline() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Timeline");
  if (!sh) return;
  var hdr = sh.getRange(1, 1, 1, 6).getValues()[0];
  if (String(hdr[0]).trim() === "sort") return; // already v2
  var n = sh.getLastRow() - 1;
  var old = n > 0 ? sh.getRange(2, 1, n, 4).getValues() : [];
  var rows = old.map(function (r) {
    var date = String(r[0] || "").trim();
    var photo = String(r[3] || "").trim();
    return [toSortDate(date), date, "", String(r[1] || ""), String(r[2] || ""), photo ? "image:" + photo : ""];
  });
  sh.clear();
  sh.getRange(1, 1, 1, TIMELINE_HEADERS.length).setValues([TIMELINE_HEADERS]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, TIMELINE_HEADERS.length).setValues(rows);
  sh.setColumnWidth(2, 150); sh.setColumnWidth(4, 240); sh.setColumnWidth(5, 240); sh.setColumnWidth(6, 380);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getConfig() {
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config").getDataRange().getValues();
  var cfg = {};
  for (var i = 1; i < rows.length; i++) cfg[rows[i][0]] = rows[i][1];
  return cfg;
}

function tabAsObjects(name, headers) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, headers.length).getValues().map(function (r, idx) {
    var o = { _row: idx + 2 };
    headers.forEach(function (h, c) { o[h] = r[c]; });
    return o;
  });
}

function findGuest(token) {
  if (!token) return null;
  var gs = tabAsObjects("Guests", GUEST_HEADERS);
  for (var i = 0; i < gs.length; i++) {
    if (String(gs[i].token).trim() === String(token).trim()) return gs[i];
  }
  return null;
}

function findResponse(token, phase) {
  var rs = tabAsObjects("Responses", RESP_HEADERS);
  for (var i = 0; i < rs.length; i++) {
    if (String(rs[i].token).trim() === String(token).trim() && rs[i].phase === phase) return rs[i];
  }
  return null;
}

// Seats taken per venue in rsvp phase, optionally excluding one token (their old answer).
function seatsTaken(excludeToken) {
  var rs = tabAsObjects("Responses", RESP_HEADERS);
  var taken = { bretagne: 0, tunis: 0 };
  rs.forEach(function (r) {
    if (r.phase !== "rsvp") return;
    if (excludeToken && String(r.token).trim() === String(excludeToken).trim()) return;
    var size = Number(r.party_size) || 0;
    if (r.bretagne === "yes") taken.bretagne += size;
    if (r.tunisia === "yes") taken.tunis += size;
  });
  return taken;
}

function respToClient(r) {
  if (!r) return null;
  return {
    names: r.names, bretagne: r.bretagne, tunisia: r.tunisia, partySize: Number(r.party_size) || 1,
    earlyArrival: r.early_arrival, hammam: r.hammam, soiree: r.soiree,
    city: r.city, country: r.country, note: r.note,
    editableUntil: r.editable_until ? new Date(r.editable_until).toISOString() : null
  };
}

// ---------- GET ----------
function doGet(e) {
  var p = (e && e.parameter) || {};
  var cfg = getConfig();

  if (p.site) {
    var days = function (s) { return s ? String(s).split("|") : null; };
    return json({
      ok: true,
      site: {
        coupleNames: cfg.couple_names || "",
        events: {
          bretagne: {
            date: { fr: cfg.bretagne_date_fr || "", en: cfg.bretagne_date_en || "" },
            place: { fr: cfg.bretagne_place_fr || "", en: cfg.bretagne_place_en || "" }
          },
          tunis: {
            date: { fr: cfg.tunis_date_fr || "", en: cfg.tunis_date_en || "" },
            place: { fr: cfg.tunis_place_fr || "", en: cfg.tunis_place_en || "" }
          }
        },
        tunisDays: { fr: days(cfg.tunis_days_fr), en: days(cfg.tunis_days_en) },
        // Timeline: prefer the dedicated "Timeline" tab; fall back to the
        // legacy single-cell Config keys timeline_fr / timeline_en.
        timeline: readTimeline() || { fr: tl(cfg.timeline_fr), en: tl(cfg.timeline_en) }
      }
    });
  }

  if (p.admin) {
    if (String(p.admin) !== String(cfg.admin_key)) return json({ ok: false, error: "bad_key" });
    return json({
      ok: true,
      phase: cfg.phase,
      capacities: { bretagne: Number(cfg.capacity_bretagne), tunis: Number(cfg.capacity_tunis) },
      guests: tabAsObjects("Guests", GUEST_HEADERS),
      responses: tabAsObjects("Responses", RESP_HEADERS)
    });
  }

  var guest = findGuest(p.g);
  if (!guest) return json({ ok: false, error: "bad_token" });

  var phase = cfg.phase || "poll";
  var existing = findResponse(p.g, phase);
  var placesLeft = null;
  if (phase === "rsvp") {
    var taken = seatsTaken(null);
    placesLeft = {
      bretagne: Math.max(0, Number(cfg.capacity_bretagne) - taken.bretagne),
      tunis: Math.max(0, Number(cfg.capacity_tunis) - taken.tunis)
    };
  }
  return json({
    ok: true,
    phase: phase,
    placesLeft: placesLeft,
    guest: {
      name: guest.name,
      vip: guest.vip === true || String(guest.vip).toUpperCase() === "TRUE",
      invitHammam: guest.invit_hammam === true || String(guest.invit_hammam).toUpperCase() === "TRUE",
      invitSoiree: guest.invit_soiree === true || String(guest.invit_soiree).toUpperCase() === "TRUE",
      lang: String(guest.lang || "").toLowerCase() === "en" ? "en" : "fr",
      plusOne: guest.plus_one === true || String(guest.plus_one).toUpperCase() === "TRUE",
      seats: Math.max(1, parseInt(guest.places, 10) || 1)
    },
    response: respToClient(existing),
    editable: phase !== "rsvp" || !existing || new Date() <= new Date(existing.editable_until)
  });
}

// ---------- POST ----------
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_json" }); }

  // Admin actions (timeline manager) carry an "action" + admin key; guests never do.
  if (body.action) return handleAdmin(body);

  var guest = findGuest(body.token);
  if (!guest) return json({ ok: false, error: "bad_token" });
  var isVip = guest.vip === true || String(guest.vip).toUpperCase() === "TRUE";
  var hasHammam = guest.invit_hammam === true || String(guest.invit_hammam).toUpperCase() === "TRUE";
  var hasSoiree = guest.invit_soiree === true || String(guest.invit_soiree).toUpperCase() === "TRUE";

  var yn = function (v) { return v === "yes" ? "yes" : "no"; };
  // VIP guests may leave an event undecided ("maybe"); regular guests are yes/no.
  var ynm = function (v) { return v === "yes" ? "yes" : v === "maybe" ? "maybe" : "no"; };
  var bretagne = isVip ? ynm(body.bretagne) : yn(body.bretagne);
  var tunisia = isVip ? ynm(body.tunisia) : yn(body.tunisia);
  if (!isVip && bretagne === "yes" && tunisia === "yes") return json({ ok: false, error: "not_vip" });

  // Base party size comes from the sheet ("places", e.g. 2 for a couple); an
  // allowed +1 adds one more only if the guest ticked the box.
  var hasPlusOne = guest.plus_one === true || String(guest.plus_one).toUpperCase() === "TRUE";
  var seats = Math.max(1, parseInt(guest.places, 10) || 1);
  var partySize = Math.max(1, Math.min(12, seats + (body.plusOne === true && hasPlusOne ? 1 : 0)));
  var earlyArrival = tunisia === "yes" && ["early", "weddingOnly"].indexOf(body.earlyArrival) >= 0 ? body.earlyArrival : "";
  var hammam = tunisia === "yes" && hasHammam ? yn(body.hammam) : "";
  var soiree = tunisia === "yes" && hasSoiree ? yn(body.soiree) : "";

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cfg = getConfig();
    var phase = cfg.phase || "poll";
    var existing = findResponse(body.token, phase);
    var now = new Date();

    // 24h edit window applies to the binding RSVP phase only; the poll stays
    // freely editable so guests can update a "not sure yet" answer any time.
    if (phase === "rsvp" && existing && now > new Date(existing.editable_until)) {
      return json({ ok: false, error: "edit_closed" });
    }

    // hard capacity check, rsvp phase only
    if (phase === "rsvp") {
      var taken = seatsTaken(body.token);
      if (bretagne === "yes" && taken.bretagne + partySize > Number(cfg.capacity_bretagne)) {
        return json({ ok: false, error: "capacity_bretagne" });
      }
      if (tunisia === "yes" && taken.tunis + partySize > Number(cfg.capacity_tunis)) {
        return json({ ok: false, error: "capacity_tunis" });
      }
    }

    var editableUntil = existing ? new Date(existing.editable_until) : new Date(now.getTime() + 24 * 3600 * 1000);
    var row = [String(body.token).trim(), now, phase, String(body.names || guest.name).slice(0, 300),
      bretagne, tunisia, partySize, earlyArrival, hammam, soiree,
      String(body.city || "").slice(0, 100), String(body.country || "").slice(0, 100),
      String(body.note || "").slice(0, 1000), editableUntil, "", ""];

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Responses");
    if (existing) {
      // keep any geocoding already done if the city didn't change
      if (existing.city === row[10] && existing.geo_lat) { row[14] = existing.geo_lat; row[15] = existing.geo_lng; }
      sh.getRange(existing._row, 1, 1, RESP_HEADERS.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    return json({ ok: true, editableUntil: editableUntil.toISOString() });
  } finally {
    lock.releaseLock();
  }
}

// ---------- timeline manager (private admin page) ----------
// Run once from the editor to grant the Drive permission the uploader needs.
function authorizeDrive() { timelineFolder(); }

function timelineFolder() {
  var name = "Wedding Timeline Photos";
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

// Rows for the manager page, already sorted by date (matches the public site).
function readTimelineRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Timeline");
  if (!sh) return [];
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var rows = sh.getRange(2, 1, n, TIMELINE_HEADERS.length).getValues();
  var out = [];
  rows.forEach(function (r, i) {
    var dFr = String(r[1] || "").trim(), descFr = String(r[3] || "").trim(), media = parseMedia(r[5]);
    if (!dFr && !descFr && !media.length) return;
    out.push({
      row: i + 2, sort: normSort(r[0]) || toSortDate(dFr),
      dateFr: dFr, dateEn: String(r[2] || "").trim(), descFr: descFr, descEn: String(r[4] || "").trim(), media: media
    });
  });
  out.sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
  return out;
}

// Upload one media payload {dataB64, mimeType, filename} to Drive, return a "type:URL" token.
function storeMedia(m) {
  var isVideo = String(m.mimeType || "").indexOf("video") === 0;
  var blob = Utilities.newBlob(Utilities.base64Decode(m.dataB64), m.mimeType || "image/jpeg", m.filename || (isVideo ? "clip.mp4" : "photo.jpg"));
  var file = timelineFolder().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return (isVideo ? "video:" : "image:") + "https://drive.google.com/file/d/" + file.getId() + "/view";
}

// A pasted link -> "type:URL" token (YouTube/Drive video vs image).
function linkToken(url) {
  url = String(url || "").trim();
  if (!url) return "";
  if (ytId(url)) return "video:" + url;
  // Drive links are ambiguous; default to image unless the user marked it a video.
  return "image:" + url;
}

function handleAdmin(body) {
  var cfg = getConfig();
  if (String(body.key) !== String(cfg.admin_key)) return json({ ok: false, error: "bad_key" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Timeline") || ensureTab(ss, "Timeline", TIMELINE_HEADERS);
  if (String(sh.getRange(1, 1).getValue()).trim() !== "sort") migrateTimeline();

  if (body.action === "list_timeline") {
    return json({ ok: true, items: readTimelineRows() });
  }

  if (body.action === "add_timeline") {
    var tokens = [];
    (body.media || []).slice(0, 3).forEach(function (m) {
      if (m && m.dataB64) tokens.push(storeMedia(m));
      else if (m && m.link) tokens.push(m.video ? "video:" + m.link : linkToken(m.link));
    });
    var sort = String(body.sort || "").trim() || toSortDate(body.dateFr);
    sh.appendRow([sort, String(body.dateFr || ""), String(body.dateEn || ""), String(body.descFr || ""), String(body.descEn || ""), tokens.join(MEDIA_SEP)]);
    return json({ ok: true, items: readTimelineRows() });
  }

  if (body.action === "delete_timeline") {
    var row = parseInt(body.row, 10);
    if (row >= 2 && row <= sh.getLastRow()) sh.deleteRow(row);
    return json({ ok: true, items: readTimelineRows() });
  }

  return json({ ok: false, error: "unknown_action" });
}
