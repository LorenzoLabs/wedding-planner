// Wizard logic. Talks to the Google Apps Script API (CONFIG.gasUrl).
// With CONFIG.gasUrl === "" the site runs in DEMO MODE with fake guests:
//   ?g=demo      → regular guest
//   ?g=demo-vip  → VIP guest invited to both weddings

(function () {
  const $rsvp = document.getElementById("rsvp");
  const params = new URLSearchParams(location.search);
  const token = params.get("g");

  const state = {
    lang: localStorage.getItem("lang") || CONFIG.defaultLang,
    step: 1,
    guest: null,      // {name, vip, invitTunisie, plusOne, seats, email, lang}
    phase: "poll",
    placesLeft: null, // {bretagne, tunis} or null
    existing: null,   // previous response or null
    editable: true,
    geoDown: false,   // city search unreachable → free text accepted
    // cityPick = place chosen from the suggestions: {city, country, region, lat, lng}
    answers: { email: "", plusOne: false, plusOneName: "", plusOneEmail: "", partySize: 1, city: "", country: "", cityPick: null, bretagne: "", tunisia: "", earlyArrival: "", soiree: "", note: "" }
  };

  const t = (k) => CONFIG.texts[state.lang][k];
  const evLabel = (k) => {
    const d = CONFIG.events[k].dateLabel[state.lang];
    return (k === "bretagne" ? t("choiceBretagne") : t("choiceTunis")) + (d ? " — " + d : "");
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- static texts (header, program) ----------
  function renderStatic() {
    document.documentElement.lang = state.lang;
    document.getElementById("couple").textContent = CONFIG.coupleNames;
    ["title", "intro", "programTitle", "bretagneTitle", "bretagneDesc", "tunisTitle", "tunisDesc"]
      .forEach(k => document.getElementById("t-" + k).textContent = t(k));
    // the note/rules pill is optional and Sheet-driven: hide it when empty
    const rulesText = t("rules");
    const rulesEl = document.getElementById("t-rules");
    rulesEl.textContent = rulesText;
    if (rulesEl.parentElement) rulesEl.parentElement.hidden = !rulesText;
    document.getElementById("t-tunisDays").innerHTML = t("tunisDays").map(d => `<li>${esc(d)}</li>`).join("");
    document.getElementById("ev-bretagne-date").textContent = CONFIG.events.bretagne.dateLabel[state.lang];
    document.getElementById("ev-tunis-date").textContent = CONFIG.events.tunis.dateLabel[state.lang];
    // the place name links to a map when a URL is configured (Sheet: *_map_url)
    ["bretagne", "tunis"].forEach(k => {
      const el = document.getElementById(`ev-${k}-place`), ev = CONFIG.events[k];
      el.textContent = ev.place[state.lang];
      if (ev.mapUrl) el.href = ev.mapUrl; else el.removeAttribute("href");
    });
    document.getElementById("lang-fr").classList.toggle("active", state.lang === "fr");
    document.getElementById("lang-en").classList.toggle("active", state.lang === "en");
    const hero = document.getElementById("hero-photo");
    if (hero) { if (CONFIG.heroPhoto) { hero.src = CONFIG.heroPhoto; hero.hidden = false; } else hero.hidden = true; }
    renderTunisieCta();
  }

  // The "see the presentation" button in the Tunisia program card appears only
  // for guests invited there (VIP or invit_tunisie) once a URL is configured.
  function renderTunisieCta() {
    const link = document.getElementById("cta-link");
    if (!link) return;
    const invited = state.guest && (state.guest.vip || state.guest.invitTunisie);
    if (!invited || !CONFIG.tunisiePageUrl) { link.hidden = true; return; }
    link.textContent = t("tunisieCtaBtn");
    link.href = CONFIG.tunisiePageUrl;
    link.hidden = false;
  }

  document.getElementById("lang-fr").onclick = () => setLang("fr");
  document.getElementById("lang-en").onclick = () => setLang("en");
  function setLang(l) { state.lang = l; localStorage.setItem("lang", l); renderStatic(); render(); }

  // ---------- API ----------
  async function apiGetGuest(tok) {
    if (!CONFIG.gasUrl) return demoGet(tok);
    const res = await fetch(`${CONFIG.gasUrl}?g=${encodeURIComponent(tok)}`);
    return res.json();
  }
  async function apiSubmit(payload) {
    if (!CONFIG.gasUrl) return { ok: true, editableUntil: new Date(Date.now() + 24 * 3600e3).toISOString() };
    const res = await fetch(CONFIG.gasUrl, { method: "POST", body: JSON.stringify(payload) });
    return res.json();
  }
  // Public site texts (couple names, dates, places) live in the Google Sheet,
  // not in this repo — fetched here at runtime.
  async function apiSite() {
    if (!CONFIG.gasUrl) return null;
    try {
      const res = await fetch(`${CONFIG.gasUrl}?site=1`);
      const d = await res.json();
      return d.ok ? d.site : null;
    } catch (e) { return null; }
  }
  function applySite(site) {
    if (!site) return;
    if (site.coupleNames) CONFIG.coupleNames = site.coupleNames;
    if (site.heroPhoto) CONFIG.heroPhoto = site.heroPhoto;
    if (site.tunisiePageUrl) CONFIG.tunisiePageUrl = site.tunisiePageUrl;
    // note/rules message is authoritative from the Sheet (empty = hidden)
    if (site.rules) ["fr", "en"].forEach(l => { CONFIG.texts[l].rules = site.rules[l] || ""; });
    ["bretagne", "tunis"].forEach(k => {
      const ev = site.events && site.events[k];
      if (!ev) return;
      const descKey = k === "bretagne" ? "bretagneDesc" : "tunisDesc";
      if (ev.map) CONFIG.events[k].mapUrl = ev.map;
      ["fr", "en"].forEach(l => {
        if (ev.date && ev.date[l]) CONFIG.events[k].dateLabel[l] = ev.date[l];
        if (ev.place && ev.place[l]) CONFIG.events[k].place[l] = ev.place[l];
        if (ev.desc && ev.desc[l]) CONFIG.texts[l][descKey] = ev.desc[l];
      });
    });
    ["fr", "en"].forEach(l => {
      if (site.tunisDays && site.tunisDays[l] && site.tunisDays[l].length) CONFIG.texts[l].tunisDays = site.tunisDays[l];
    });
  }

  function demoGet(tok) {
    if (tok === "demo-vip") return { ok: true, phase: "rsvp", placesLeft: { bretagne: 12, tunis: 3 }, editable: true, response: null, guest: { name: "Ava & Sam Demo", vip: true, plusOne: false, seats: 2, invitTunisie: true, email: "" } };
    if (tok === "demo") return { ok: true, phase: "poll", placesLeft: null, editable: true, response: null, guest: { name: "Alex Demo", vip: false, plusOne: true, seats: 1, invitTunisie: false, email: "" } };
    return { ok: false, error: "bad_token" };
  }

  // ---------- rendering ----------
  function render() {
    if (!token) { $rsvp.innerHTML = `<p class="text-center">${esc(t("noToken"))}</p>`; return; }
    if (state.error === "bad_token") { $rsvp.innerHTML = `<p class="text-center">${esc(t("badToken"))}</p>`; return; }
    if (state.error === "loading") { $rsvp.innerHTML = `<p class="text-center">${esc(t("loading"))}</p>`; return; }
    if (state.error === "generic") { $rsvp.innerHTML = `<p class="text-center">${esc(t("errGeneric"))}</p>`; return; }
    if (!state.guest) return;
    renderTunisieCta();

    if (state.step === 6) { renderSuccess(); return; }

    const banner = state.phase === "poll" ? t("pollBanner") : t("rsvpBanner");
    let html = `
      <p class="text-lg">${esc(t("hello"))} <strong>${esc(state.guest.name)}</strong> 👋</p>
      <p class="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 my-4">${esc(banner)}</p>`;

    if (!state.editable && state.existing) {
      html += `<div class="text-sm bg-stone-100 rounded-lg p-3">
        <p class="font-medium mb-1">${esc(t("alreadyAnswered"))}</p>
        <p>${esc(summaryOf(state.existing))}</p>
        <p class="mt-2 text-stone-500">${esc(t("editClosed"))}</p></div>`;
      $rsvp.innerHTML = html; return;
    }

    if (state.step === 2) html += stepBasics();
    else if (state.step === 3) html += stepChoice();
    else if (state.step === 4) html += stepTunisia();
    else if (state.step === 5) html += stepRecap();
    else html += stepStart();

    $rsvp.innerHTML = html;
    bindStep();
  }

  function navButtons(backStep, nextLabel, nextId) {
    return `<div class="flex gap-3 mt-6">
      ${backStep ? `<button data-back="${backStep}" class="px-4 py-2 rounded-lg border border-stone-300">${esc(t("back"))}</button>` : ""}
      <button id="${nextId || "next"}" class="flex-1 px-4 py-2 rounded-lg bg-stone-800 text-white">${esc(nextLabel || t("next"))}</button>
    </div>`;
  }

  function stepStart() {
    const answered = state.existing ? `<div class="text-sm bg-stone-100 rounded-lg p-3 mb-4">
      <p class="font-medium mb-1">${esc(t("alreadyAnswered"))}</p><p>${esc(summaryOf(state.existing))}</p></div>` : "";
    return `${answered}<button id="start" class="w-full px-4 py-3 rounded-lg bg-stone-800 text-white text-lg">
      ${esc(state.existing ? t("update") : (state.phase === "poll" ? t("choiceQuestionPoll") : t("choiceQuestionRsvp")))}</button>`;
  }

  function stepBasics() {
    const a = state.answers;
    const title = t("step2Title") ? `<h3 class="text-lg font-semibold mb-3">${esc(t("step2Title"))}</h3>` : "";
    const email = a.email || state.guest.email || "";
    const cityShown = a.cityPick ? `${a.cityPick.city}, ${a.cityPick.country}` : (a.city || "");
    const seats = state.guest.seats || 1;
    const seatsInfo = seats >= 2 ? `<p class="text-sm mb-3 bg-stone-100 rounded-lg p-2">${esc(t("seatsInfo").replace("{n}", seats))}</p>` : "";
    const plusOne = state.guest.plusOne ? `
      <label class="flex items-center gap-2 mb-3 cursor-pointer">
        <input id="f-plusone" type="checkbox" class="w-4 h-4" ${a.plusOne ? "checked" : ""}>
        <span>${esc(t("plusOneLabel"))}</span>
      </label>
      <div id="f-plusone-fields" class="mb-4 pl-6 space-y-2 ${a.plusOne ? "" : "hidden"}">
        <input id="f-po-name" class="w-full border border-stone-300 rounded-lg p-2" placeholder="${esc(t("plusOneNameLabel"))}" value="${esc(a.plusOneName || "")}">
        <input id="f-po-email" type="email" class="w-full border border-stone-300 rounded-lg p-2" placeholder="${esc(t("plusOneEmailLabel"))}" value="${esc(a.plusOneEmail || "")}">
      </div>` : "";
    return `${title}${seatsInfo}
      <div class="mb-4"><label class="block text-sm mb-1">${esc(t("emailLabel"))}</label>
        <input id="f-email" type="email" autocomplete="email" inputmode="email" class="w-full border border-stone-300 rounded-lg p-2" value="${esc(email)}"></div>
      ${plusOne}
      <div class="relative"><label class="block text-sm mb-1">${esc(t("cityLabel"))}</label>
        <input id="f-city" autocomplete="off" class="w-full border border-stone-300 rounded-lg p-2" placeholder="${esc(t("cityPlaceholder"))}" value="${esc(cityShown)}">
        <ul id="f-city-list" class="city-list hidden"></ul>
      </div>
      <p id="f-err" class="text-sm text-red-600 mt-2 hidden"></p>
      ${navButtons(1)}`;
  }

  // ---------- city picker (Photon, OpenStreetMap data, no API key) ----------
  // Guests must pick a real place from the suggestions: that gives a clean city
  // name, its country in the guest's language and coordinates for the map.
  let cityTimer = null, cityAbort = null;
  function bindCityPicker() {
    const input = document.getElementById("f-city"), list = document.getElementById("f-city-list");
    if (!input || !list) return;
    const close = () => { list.classList.add("hidden"); list.innerHTML = ""; };
    input.oninput = () => {
      state.answers.cityPick = null; // typing again invalidates the previous pick
      clearTimeout(cityTimer);
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      cityTimer = setTimeout(() => searchCity(q, list, input, close), 250);
    };
    input.onblur = () => setTimeout(close, 150);
  }
  async function searchCity(q, list, input, close) {
    if (cityAbort) cityAbort.abort();
    cityAbort = new AbortController();
    let feats;
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=${state.lang}`
        + "&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village";
      const res = await fetch(url, { signal: cityAbort.signal });
      feats = (await res.json()).features || [];
      state.geoDown = false;
    } catch (e) {
      if (e.name === "AbortError") return;
      state.geoDown = true; close(); return; // search unavailable: free text is accepted
    }
    const seen = new Set();
    const items = feats
      .map(f => ({ city: f.properties.name, country: f.properties.country || "", region: f.properties.state || "",
                   lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      .filter(it => it.city && it.country && !seen.has(it.city + "|" + it.country) && seen.add(it.city + "|" + it.country))
      .slice(0, 6);
    if (!items.length) {
      list.innerHTML = `<li class="text-stone-400" style="cursor:default">${esc(t("cityNoResult"))}</li>`;
      list.classList.remove("hidden"); return;
    }
    list.innerHTML = items.map((it, i) =>
      `<li data-i="${i}">${esc(it.city)}<small>${esc([it.region, it.country].filter(Boolean).join(", "))}</small></li>`).join("");
    list.classList.remove("hidden");
    list.querySelectorAll("li[data-i]").forEach(li => li.onmousedown = (ev) => {
      ev.preventDefault(); // keep focus so blur doesn't close the list before the click lands
      const it = items[+li.dataset.i];
      state.answers.cityPick = it; state.answers.city = it.city; state.answers.country = it.country;
      input.value = `${it.city}, ${it.country}`;
      close();
    });
  }

  function placesBadge(evKey) {
    if (!state.placesLeft || state.placesLeft[evKey] == null) return "";
    const n = state.placesLeft[evKey];
    const txt = n <= 0 ? t("full") : `${n} ${t("placesLeft")}`;
    return `<span class="text-xs ml-2 ${n <= 0 ? "text-red-600" : "text-stone-500"}">(${esc(txt)})</span>`;
  }

  function stepChoice() {
    const a = state.answers;
    let body;
    if (state.guest.vip) {
      const labels = { yes: t("vipYes"), no: t("vipNo") };
      const yn = (field) => ["yes", "no"].map(v => `
        <button class="btn-choice px-4 py-2 rounded-lg border border-stone-300 ${a[field] === v ? "selected" : ""}"
          data-set="${field}:${v}">${esc(labels[v])}</button>`).join("");
      body = `<p class="mb-3">${esc(t("vipIntro"))}</p>
        <div class="mb-4"><p class="font-medium mb-2">${esc(evLabel("bretagne"))} ${placesBadge("bretagne")}</p><div class="flex gap-2">${yn("bretagne")}</div></div>
        <div class="mb-2"><p class="font-medium mb-2">${esc(evLabel("tunis"))} ${placesBadge("tunis")}</p><div class="flex gap-2">${yn("tunisia")}</div></div>`;
    } else {
      const opt = (val, label, badge) => `
        <button class="btn-choice w-full text-left px-4 py-3 rounded-lg border border-stone-300 mb-2 ${a._single === val ? "selected" : ""}"
          data-single="${val}">${esc(label)} ${badge || ""}</button>`;
      body = `${opt("bretagne", evLabel("bretagne"), placesBadge("bretagne"))}
              ${opt("tunis", evLabel("tunis"), placesBadge("tunis"))}
              ${opt("decline", t("choiceDecline"))}`;
    }
    return `<h3 class="text-lg font-semibold mb-3">${esc(state.phase === "poll" ? t("choiceQuestionPoll") : t("choiceQuestionRsvp"))}</h3>
      ${body}<p id="f-err" class="text-sm text-red-600 mt-2 hidden"></p>${navButtons(2)}`;
  }

  function stepTunisia() {
    const a = state.answers;
    const yn = (field, q) => `
      <div class="mb-4"><p class="font-medium mb-2">${esc(q)}</p><div class="flex gap-2">
        ${["yes", "no"].map(v => `<button class="btn-choice px-4 py-2 rounded-lg border border-stone-300 ${a[field] === v ? "selected" : ""}"
          data-set="${field}:${v}">${esc(v === "yes" ? t("yes") : t("no"))}</button>`).join("")}
      </div></div>`;
    return `<h3 class="text-lg font-semibold mb-3">${esc(t("step4Title"))}</h3>
      <div class="mb-4"><p class="font-medium mb-2">${esc(t("earlyArrivalQ"))}</p>
        ${[["early", t("earlyYes")], ["weddingOnly", t("earlyNo")]].map(([v, l]) => `
          <button class="btn-choice w-full text-left px-4 py-2 rounded-lg border border-stone-300 mb-2 ${a.earlyArrival === v ? "selected" : ""}"
            data-set="earlyArrival:${v}">${esc(l)}</button>`).join("")}
      </div>
      ${yn("soiree", t("soireeQ"))}
      <p id="f-err" class="text-sm text-red-600 mt-2 hidden"></p>${navButtons(3)}`;
  }

  function stepRecap() {
    const a = state.answers;
    return `<h3 class="text-lg font-semibold mb-3">${esc(t("step3Title"))}</h3>
      <div class="text-sm bg-stone-100 rounded-lg p-3 mb-4">${esc(summaryOf(payload()))}</div>
      <label class="block text-sm mb-1">${esc(t("noteLabel"))}</label>
      <textarea id="f-note" rows="2" class="w-full border border-stone-300 rounded-lg p-2">${esc(a.note)}</textarea>
      <p id="f-err" class="text-sm text-red-600 mt-2 hidden"></p>
      ${navButtons(a.tunisia === "yes" ? 4 : 3, state.existing ? t("update") : t("submit"), "send")}`;
  }

  function renderSuccess() {
    const until = state.editableUntil ? new Date(state.editableUntil) : null;
    const untilTxt = until ? until.toLocaleString(state.lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeStyle: "short" }) : "";
    $rsvp.innerHTML = `<div class="text-center">
      <p class="text-3xl mb-2">🎉</p>
      <h3 class="text-xl font-semibold mb-2">${esc(t("successTitle"))}</h3>
      <p>${esc(t("successBody"))}</p>
      ${until ? `<p class="text-sm text-stone-500 mt-3">${esc(t("editUntil"))} ${esc(untilTxt)}.</p>` : ""}
    </div>`;
  }

  function summaryOf(r) {
    const parts = [];
    if (r.bretagne === "yes") parts.push(evLabel("bretagne"));
    if (r.tunisia === "yes") {
      let s = evLabel("tunis");
      if (r.earlyArrival) s += r.earlyArrival === "early" ? ` · ${t("earlyYes")}` : ` · ${t("earlyNo")}`;
      if (r.soiree === "yes") s += state.lang === "fr" ? " · soirée ✓" : " · ceremony ✓";
      parts.push(s);
    }
    if (!parts.length) parts.push(t("choiceDecline"));
    const guests = parts.join(" + ");
    const n = r.partySize || 1;
    let out = n >= 2 ? `${guests} · ${n} ${t("peopleShort")}` : guests;
    if (r.plusOneName) out += ` · +1 : ${r.plusOneName}`;
    return out;
  }

  // ---------- step bindings & validation ----------
  function err(msg) { const e = document.getElementById("f-err"); if (e) { e.textContent = msg; e.classList.remove("hidden"); } }

  function bindStep() {
    const start = document.getElementById("start");
    if (start) start.onclick = () => go(2);
    document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => go(+b.dataset.back));
    document.querySelectorAll("[data-single]").forEach(b => b.onclick = () => {
      const v = b.dataset.single;
      state.answers._single = v;
      state.answers.bretagne = v === "bretagne" ? "yes" : "no";
      state.answers.tunisia = v === "tunis" ? "yes" : "no";
      render();
    });
    document.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
      const [f, v] = b.dataset.set.split(":");
      state.answers[f] = v;
      render();
    });
    const po = document.getElementById("f-plusone");
    if (po) po.onchange = () => {
      const f = document.getElementById("f-plusone-fields");
      if (f) f.classList.toggle("hidden", !po.checked);
    };
    bindCityPicker();
    const next = document.getElementById("next");
    if (next) next.onclick = onNext;
    const send = document.getElementById("send");
    if (send) send.onclick = onSend;
  }

  function go(step) { state.step = step; render(); window.scrollTo({ top: document.getElementById("rsvp").offsetTop - 20, behavior: "smooth" }); }

  function onNext() {
    const a = state.answers;
    if (state.step === 2) {
      const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      a.email = (document.getElementById("f-email").value || "").trim();
      if (!emailOk(a.email)) return err(t("emailInvalid"));
      const po = document.getElementById("f-plusone");
      a.plusOne = state.guest.plusOne && po ? po.checked : false;
      a.partySize = (state.guest.seats || 1) + (a.plusOne ? 1 : 0);
      if (a.plusOne) {
        a.plusOneName = (document.getElementById("f-po-name").value || "").trim();
        a.plusOneEmail = (document.getElementById("f-po-email").value || "").trim();
        if (!a.plusOneName) return err(t("plusOneNameRequired"));
        if (a.plusOneEmail && !emailOk(a.plusOneEmail)) return err(t("emailInvalid"));
      } else { a.plusOneName = ""; a.plusOneEmail = ""; }
      const typed = document.getElementById("f-city").value.trim();
      if (a.cityPick) { a.city = a.cityPick.city; a.country = a.cityPick.country; }
      else if (state.geoDown && typed) { a.city = typed; a.country = ""; } // search down: accept free text
      else return err(t("cityPickRequired"));
      return go(3);
    }
    if (state.step === 3) {
      if (state.guest.vip) { if (!a.bretagne || !a.tunisia) return err(t("required")); }
      else if (!a._single) return err(t("required"));
      return go(a.tunisia === "yes" ? 4 : 5);
    }
    if (state.step === 4) {
      if (!a.earlyArrival) return err(t("required"));
      if (!a.soiree) return err(t("required"));
      return go(5);
    }
  }

  function payload() {
    const a = state.answers;
    return {
      token, names: state.guest.name, email: a.email, partySize: a.partySize, plusOne: !!a.plusOne,
      plusOneName: a.plusOne ? a.plusOneName : "", plusOneEmail: a.plusOne ? a.plusOneEmail : "",
      city: a.city, country: a.country,
      lat: a.cityPick ? a.cityPick.lat : "", lng: a.cityPick ? a.cityPick.lng : "",
      bretagne: a.bretagne || "no", tunisia: a.tunisia || "no",
      earlyArrival: a.tunisia === "yes" ? a.earlyArrival : "",
      soiree: a.tunisia === "yes" ? a.soiree : "",
      note: a.note
    };
  }

  async function onSend() {
    state.answers.note = document.getElementById("f-note").value.trim();
    const send = document.getElementById("send");
    send.disabled = true; send.textContent = "…";
    try {
      const res = await apiSubmit(payload());
      if (res.ok) { state.editableUntil = res.editableUntil; state.step = 6; render(); return; }
      send.disabled = false; send.textContent = state.existing ? t("update") : t("submit");
      if (res.error === "capacity_bretagne" || res.error === "capacity_tunis") err(t("errCapacity"));
      else if (res.error === "bad_email") { go(2); err(t("emailInvalid")); }
      else if (res.error === "edit_closed") { state.editable = false; render(); }
      else err(t("errGeneric"));
    } catch (e) {
      send.disabled = false; send.textContent = state.existing ? t("update") : t("submit");
      err(t("errGeneric"));
    }
  }

  // ---------- boot ----------
  function prefill(r) {
    const a = state.answers;
    a.email = r.email || "";
    a.partySize = r.partySize || 1; a.plusOne = (r.partySize || 1) > (state.guest.seats || 1); a.city = r.city || ""; a.country = r.country || "";
    // a previously saved city counts as a valid pick (it was validated then)
    a.cityPick = r.city ? { city: r.city, country: r.country || "", region: "", lat: r.lat || "", lng: r.lng || "" } : null;
    a.plusOneName = r.plusOneName || ""; a.plusOneEmail = r.plusOneEmail || "";
    a.bretagne = r.bretagne || ""; a.tunisia = r.tunisia || "";
    if (!state.guest.vip) a._single = r.bretagne === "yes" ? "bretagne" : r.tunisia === "yes" ? "tunis" : (r.bretagne === "no" && r.tunisia === "no" ? "decline" : "");
    a.earlyArrival = r.earlyArrival || ""; a.soiree = r.soiree || ""; a.note = r.note || "";
  }

  async function boot() {
    // Real site texts come from the API (privacy: none in this public repo).
    // Cache them so returning visitors render instantly; on first visit hide
    // the placeholder names/dates until the fetch lands (4s fallback).
    let siteLoaded = !CONFIG.gasUrl;
    try {
      const cached = localStorage.getItem("siteCfg");
      if (cached) { applySite(JSON.parse(cached)); siteLoaded = true; }
    } catch (e) { /* storage unavailable */ }
    document.body.classList.toggle("site-pending", !siteLoaded);
    renderStatic();
    const reveal = () => { document.body.classList.remove("site-pending"); };
    setTimeout(reveal, 4000);
    apiSite().then(site => {
      applySite(site);
      try { if (site) localStorage.setItem("siteCfg", JSON.stringify(site)); } catch (e) {}
      reveal();
      renderStatic();
      if (state.step === 1 || !token) render();
    });
    if (!token) { render(); return; }
    state.error = "loading"; render();
    try {
      const res = await apiGetGuest(token);
      state.error = null;
      if (!res.ok) { state.error = "bad_token"; render(); return; }
      // per-guest language from the sheet, unless the visitor already chose one
      if (res.guest.lang && !localStorage.getItem("lang")) { state.lang = res.guest.lang; renderStatic(); }
      state.guest = res.guest; state.phase = res.phase;
      state.placesLeft = res.placesLeft; state.existing = res.response; state.editable = res.editable;
      if (res.response) { prefill(res.response); state.editableUntil = res.response.editableUntil; }
      state.step = 1; render();
    } catch (e) { state.error = "generic"; render(); }
  }
  boot();
})();
