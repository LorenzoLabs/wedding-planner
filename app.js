// Wizard logic. Talks to the Google Apps Script API (CONFIG.gasUrl).
// With CONFIG.gasUrl === "" the site runs in DEMO MODE with fake guests:
//   ?g=demo      → regular guest
//   ?g=demo-vip  → VIP guest invited to both + hammam + soirée

(function () {
  const $rsvp = document.getElementById("rsvp");
  const params = new URLSearchParams(location.search);
  const token = params.get("g");

  const state = {
    lang: localStorage.getItem("lang") || CONFIG.defaultLang,
    step: 1,
    guest: null,      // {name, vip, invitHammam, invitSoiree}
    phase: "poll",
    placesLeft: null, // {bretagne, tunis} or null
    existing: null,   // previous response or null
    editable: true,
    answers: { names: "", partySize: 1, city: "", country: "", bretagne: "", tunisia: "", earlyArrival: "", hammam: "", soiree: "", note: "" }
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
    ["title", "intro", "programTitle", "bretagneTitle", "bretagneDesc", "tunisTitle", "tunisDesc", "rules"]
      .forEach(k => document.getElementById("t-" + k).textContent = t(k));
    document.getElementById("t-tunisDays").innerHTML = t("tunisDays").map(d => `<li>${esc(d)}</li>`).join("");
    document.getElementById("ev-bretagne-date").textContent = CONFIG.events.bretagne.dateLabel[state.lang];
    document.getElementById("ev-bretagne-place").textContent = CONFIG.events.bretagne.place[state.lang];
    document.getElementById("ev-tunis-date").textContent = CONFIG.events.tunis.dateLabel[state.lang];
    document.getElementById("ev-tunis-place").textContent = CONFIG.events.tunis.place[state.lang];
    document.getElementById("lang-fr").classList.toggle("active", state.lang === "fr");
    document.getElementById("lang-en").classList.toggle("active", state.lang === "en");
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
    ["bretagne", "tunis"].forEach(k => {
      const ev = site.events && site.events[k];
      if (!ev) return;
      ["fr", "en"].forEach(l => {
        if (ev.date && ev.date[l]) CONFIG.events[k].dateLabel[l] = ev.date[l];
        if (ev.place && ev.place[l]) CONFIG.events[k].place[l] = ev.place[l];
      });
    });
    ["fr", "en"].forEach(l => {
      if (site.tunisDays && site.tunisDays[l] && site.tunisDays[l].length) CONFIG.texts[l].tunisDays = site.tunisDays[l];
    });
  }

  function demoGet(tok) {
    if (tok === "demo-vip") return { ok: true, phase: "rsvp", placesLeft: { bretagne: 12, tunis: 3 }, editable: true, response: null, guest: { name: "Ava & Sam Demo", vip: true, invitHammam: true, invitSoiree: true } };
    if (tok === "demo") return { ok: true, phase: "poll", placesLeft: null, editable: true, response: null, guest: { name: "Alex Demo", vip: false, invitHammam: false, invitSoiree: true } };
    return { ok: false, error: "bad_token" };
  }

  // ---------- rendering ----------
  function render() {
    if (!token) { $rsvp.innerHTML = `<p class="text-center">${esc(t("noToken"))}</p>`; return; }
    if (state.error === "bad_token") { $rsvp.innerHTML = `<p class="text-center">${esc(t("badToken"))}</p>`; return; }
    if (state.error === "loading") { $rsvp.innerHTML = `<p class="text-center">${esc(t("loading"))}</p>`; return; }
    if (state.error === "generic") { $rsvp.innerHTML = `<p class="text-center">${esc(t("errGeneric"))}</p>`; return; }
    if (!state.guest) return;

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
    return `<h3 class="text-lg font-semibold mb-3">${esc(t("step2Title"))}</h3>
      <label class="block text-sm mb-1">${esc(t("namesLabel"))}</label>
      <input id="f-names" class="w-full border border-stone-300 rounded-lg p-2 mb-3" value="${esc(a.names || state.guest.name)}">
      <label class="block text-sm mb-1">${esc(t("partySizeLabel"))}</label>
      <input id="f-party" type="number" min="1" max="10" class="w-24 border border-stone-300 rounded-lg p-2 mb-3" value="${esc(a.partySize)}">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm mb-1">${esc(t("cityLabel"))}</label>
          <input id="f-city" class="w-full border border-stone-300 rounded-lg p-2" value="${esc(a.city)}"></div>
        <div><label class="block text-sm mb-1">${esc(t("countryLabel"))}</label>
          <input id="f-country" class="w-full border border-stone-300 rounded-lg p-2" value="${esc(a.country)}"></div>
      </div>
      <p id="f-err" class="text-sm text-red-600 mt-2 hidden"></p>
      ${navButtons(1)}`;
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
      const yn = (field) => ["yes", "no"].map(v => `
        <button class="btn-choice px-4 py-2 rounded-lg border border-stone-300 ${a[field] === v ? "selected" : ""}"
          data-set="${field}:${v}">${esc(v === "yes" ? t("vipYes") : t("vipNo"))}</button>`).join("");
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
      ${state.guest.invitHammam ? yn("hammam", t("hammamQ")) : ""}
      ${state.guest.invitSoiree ? yn("soiree", t("soireeQ")) : ""}
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
      if (r.hammam === "yes") s += " · hammam ✓";
      if (r.soiree === "yes") s += state.lang === "fr" ? " · soirée ✓" : " · ceremony ✓";
      parts.push(s);
    }
    if (!parts.length) parts.push(t("choiceDecline"));
    const psLabel = state.lang === "fr" ? "adulte(s)" : "adult(s)";
    return `${parts.join(" + ")} — ${r.partySize} ${psLabel}`;
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
    const next = document.getElementById("next");
    if (next) next.onclick = onNext;
    const send = document.getElementById("send");
    if (send) send.onclick = onSend;
  }

  function go(step) { state.step = step; render(); window.scrollTo({ top: document.getElementById("rsvp").offsetTop - 20, behavior: "smooth" }); }

  function onNext() {
    const a = state.answers;
    if (state.step === 2) {
      a.names = document.getElementById("f-names").value.trim();
      a.partySize = Math.max(1, parseInt(document.getElementById("f-party").value, 10) || 0);
      a.city = document.getElementById("f-city").value.trim();
      a.country = document.getElementById("f-country").value.trim();
      if (!a.names || !a.city || !a.country) return err(t("required"));
      return go(3);
    }
    if (state.step === 3) {
      if (state.guest.vip) { if (!a.bretagne || !a.tunisia) return err(t("required")); }
      else if (!a._single) return err(t("required"));
      return go(a.tunisia === "yes" ? 4 : 5);
    }
    if (state.step === 4) {
      if (!a.earlyArrival) return err(t("required"));
      if (state.guest.invitHammam && !a.hammam) return err(t("required"));
      if (state.guest.invitSoiree && !a.soiree) return err(t("required"));
      return go(5);
    }
  }

  function payload() {
    const a = state.answers;
    return {
      token, names: a.names, partySize: a.partySize, city: a.city, country: a.country,
      bretagne: a.bretagne || "no", tunisia: a.tunisia || "no",
      earlyArrival: a.tunisia === "yes" ? a.earlyArrival : "",
      hammam: a.tunisia === "yes" && state.guest.invitHammam ? a.hammam : "",
      soiree: a.tunisia === "yes" && state.guest.invitSoiree ? a.soiree : "",
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
    a.names = r.names || ""; a.partySize = r.partySize || 1; a.city = r.city || ""; a.country = r.country || "";
    a.bretagne = r.bretagne || ""; a.tunisia = r.tunisia || "";
    if (!state.guest.vip) a._single = r.bretagne === "yes" ? "bretagne" : r.tunisia === "yes" ? "tunis" : (r.bretagne === "no" && r.tunisia === "no" ? "decline" : "");
    a.earlyArrival = r.earlyArrival || ""; a.hammam = r.hammam || ""; a.soiree = r.soiree || ""; a.note = r.note || "";
  }

  async function boot() {
    renderStatic();
    apiSite().then(site => {
      applySite(site);
      renderStatic();
      if (state.step === 1 || !token) render();
    });
    if (!token) { render(); return; }
    state.error = "loading"; render();
    try {
      const res = await apiGetGuest(token);
      state.error = null;
      if (!res.ok) { state.error = "bad_token"; render(); return; }
      state.guest = res.guest; state.phase = res.phase;
      state.placesLeft = res.placesLeft; state.existing = res.response; state.editable = res.editable;
      if (res.response) { prefill(res.response); state.editableUntil = res.response.editableUntil; }
      state.step = 1; render();
    } catch (e) { state.error = "generic"; render(); }
  }
  boot();
})();
