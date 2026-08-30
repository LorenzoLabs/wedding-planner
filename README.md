# wedding-planner

RSVP site for a two-location wedding, free to run: static site on GitHub Pages,
answers stored live in a Google Sheet through a Google Apps Script API.

Built for a wedding split between two countries, designed as a template: fork it,
edit one config file, plug your own Google Sheet.

**Privacy by design**: the repo contains zero personal data. Couple names, dates,
venues and the detailed program live in your private Google Sheet (Config tab)
and are fetched by the page at runtime; the RSVP page itself is `noindex`.

## What it does

- **Personal invite links** — each guest gets `…/?g=abc123`; no account, no typing codes.
- **One-of-two choice** — regular guests pick Brittany *or* Tunisia (or decline);
  VIP guests are invited to both and answer yes/no per wedding.
- **Per-event side lists** — gender-separated hammam, women's ceremony: each guest
  only sees the questions for events they're invited to (flags in the sheet).
- **Capacity limits** — hard-enforced per venue with a script lock; guests see live
  "places left" counters.
- **24h edit window** — guests can change their answer for 24h, then it's final.
- **Two phases** — a non-binding poll first ("where would you go?" — helps book
  early), then the real RSVP; one cell flips the mode.
- **Private dashboard** — counts, per-event lists, all answers, and a Leaflet map
  of guests colored by choice. Secret key in the URL.
- **FR / EN** — full bilingual UI, texts in `config.js`.
- **Demo mode** — leave `gasUrl` empty and browse with `?g=demo` or `?g=demo-vip`
  to preview without any backend.

## Stack

GitHub Pages · vanilla JS + Tailwind (CDN) · Google Apps Script + Google Sheet ·
Leaflet + OpenStreetMap. No build step, no dependencies to install, no server.

## Get started

See [SETUP.md](SETUP.md) — about 20 minutes from fork to live site.

## Files

| File | Role |
|---|---|
| `config.js` | everything wedding-specific: texts FR/EN, dates, API URL |
| `index.html` + `app.js` | the guest-facing RSVP wizard |
| `admin.html` | private dashboard (table, lists, map) |
| `apps-script/Code.gs` | the API: paste into your Sheet's Apps Script |
| `templates/messages.md` | WhatsApp/email invitation templates FR/EN |
