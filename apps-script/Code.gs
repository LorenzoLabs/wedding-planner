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

var GUEST_HEADERS = ["token", "name", "contact", "vip", "gender", "invit_hammam", "invit_soiree", "city", "country", "importance", "lang", "plus_one"];
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
      ["test-reg-fr", "Testeur France", "", false, "M", false, false, "Rennes", "France", "", "", false],
      ["test-reg-tn", "Testeuse Tunisie", "", false, "F", true, true, "Tunis", "Tunisie", "", "", true],
      ["test-vip", "Couple VIP", "", true, "F", true, true, "Berlin", "Germany", "", "en", true]
    ]);
  }
}

function ensureTab(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  return sh;
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

// ---------- helpers ----------
function tl(s) {
  if (!s) return null;
  return String(s).split("||").map(function (item) {
    var f = item.split("~");
    return { date: (f[0] || "").trim(), text: (f[1] || "").trim(), img: (f[2] || "").trim() };
  });
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
        // timeline_fr / timeline_en: items separated by "||", fields by "~":
        // "2019~Notre rencontre~https://photo-url||2026~Fiançailles~"
        timeline: { fr: tl(cfg.timeline_fr), en: tl(cfg.timeline_en) }
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
      plusOne: guest.plus_one === true || String(guest.plus_one).toUpperCase() === "TRUE"
    },
    response: respToClient(existing),
    editable: !existing || new Date() <= new Date(existing.editable_until)
  });
}

// ---------- POST ----------
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_json" }); }

  var guest = findGuest(body.token);
  if (!guest) return json({ ok: false, error: "bad_token" });
  var isVip = guest.vip === true || String(guest.vip).toUpperCase() === "TRUE";
  var hasHammam = guest.invit_hammam === true || String(guest.invit_hammam).toUpperCase() === "TRUE";
  var hasSoiree = guest.invit_soiree === true || String(guest.invit_soiree).toUpperCase() === "TRUE";

  var yn = function (v) { return v === "yes" ? "yes" : "no"; };
  var bretagne = yn(body.bretagne), tunisia = yn(body.tunisia);
  if (!isVip && bretagne === "yes" && tunisia === "yes") return json({ ok: false, error: "not_vip" });

  // party size is 1, or 2 when this guest is allowed a +1 and brings one
  var hasPlusOne = guest.plus_one === true || String(guest.plus_one).toUpperCase() === "TRUE";
  var partySize = Math.max(1, Math.min(hasPlusOne ? 2 : 1, parseInt(body.partySize, 10) || 1));
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

    // 24h edit window, counted from the first submission of this phase
    if (existing && now > new Date(existing.editable_until)) {
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
