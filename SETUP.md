# Setup — from fork to live RSVP site (~20 minutes)

The site is static (GitHub Pages). Answers are stored in a Google Sheet you own,
through a free Google Apps Script acting as the API. No server, no cost.

## 1. The Google Sheet (the database)

1. Create a new Google Sheet (any name).
2. Menu **Extensions → Apps Script**.
3. Delete the default code, paste the whole content of [`apps-script/Code.gs`](apps-script/Code.gs), save.
4. In the editor toolbar, select the function **`setupSheet`** and click **Run**
   (authorize when asked — it only touches this spreadsheet).
   This creates the three tabs with headers, a default `Config`, and 3 test guests.
5. Look at the **Config** tab: set your capacities, note the generated `admin_key`.
   `phase` starts at `poll` (non-binding "where would you go?"); flip the cell to
   `rsvp` when answers become final.
6. **Personal texts live here, not in the repo** (the repo is public). Add these
   key/value rows to Config — the site fetches them at runtime:
   - `couple_names` — e.g. "Marie & Karim"
   - `bretagne_date_fr`, `bretagne_date_en` — e.g. "1er août 2030" / "August 1, 2030"
   - `bretagne_place_fr`, `bretagne_place_en`
   - `tunis_date_fr`, `tunis_date_en`
   - `tunis_place_fr`, `tunis_place_en`
   - `tunis_days_fr`, `tunis_days_en` — program lines separated by `|`,
     e.g. "Premiers jours : traditions|Veille : soirée de la femme|Dernier jour : le mariage"
   The "our story" timeline is edited in its own **Timeline** tab (run
   `setupTimelineTab` once to create it) — see below. The legacy Config keys
   `timeline_fr` / `timeline_en` still work as a fallback if the tab is empty.

## 6. The Timeline tab (photos + captions, editable by anyone)

Run **`setupTimelineTab`** in Apps Script once. It adds a **Timeline** tab with
one row per moment and these columns:

| column | what |
|---|---|
| `date` | e.g. "16 mars 2025" (free text, shown on the polaroid) |
| `description_fr` | the caption in French |
| `description_en` | the caption in English (leave empty to reuse the French one) |
| `photo` | paste the normal Google Drive **share link** of the photo |

Add a row, done — the site updates within a minute. A row without a photo shows a
botanical ornament instead.

### Easiest: the drag-and-drop uploader page

`…/timeline-admin.html?key=<admin_key>` is a private page where you drag in **up to
3 photos or videos** per moment, pick a **date** (moments auto-sort chronologically),
type the captions, and click **Ajouter le moment**. Media uploads to your Google
Drive automatically. Multiple photos render as a fanned polaroid pile on the site.
Videos: drop a short clip (max ~35 MB) or paste a **YouTube / Google Drive** link.
One-time setup: in Apps Script run **`authorizeDrive`** once and grant the Drive
permission (media is saved to a "Wedding Timeline Photos" folder in your Drive; it
never touches the public repo). If you edited an old Timeline tab, run
**`migrateTimeline`** once to upgrade it to the new format.

### Or by hand

Add a row in the Timeline tab and paste a Google Drive **share link** in the
`photo` column (right-click the photo → Share → "Anyone with the link" → Copy).
The backend converts that link into a displayable image automatically.

## 2. Deploy the API

1. In Apps Script: **Deploy → New deployment → Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**. Deploy.
3. Copy the Web app URL (`https://script.google.com/macros/s/…/exec`).

> After ANY later change to Code.gs: **Deploy → Manage deployments → edit →
> New version**. Editing the code alone does not update the live API.

## 3. The site

1. Fork this repo (or use it directly).
2. Edit [`config.js`](config.js): paste the Web app URL in `gasUrl`, set
   `coupleNames`, dates, places, and all texts (FR + EN).
3. Repo **Settings → Pages → Deploy from branch → main / root**.
4. Your site is at `https://<user>.github.io/wedding-planner/`.

While `gasUrl` is empty the site runs in **demo mode**: `?g=demo` (regular guest)
and `?g=demo-vip` (VIP) work with fake data — handy to preview the design.

## 4. Guests and personal links

1. Fill the **Guests** tab: one row per invitation (a couple = one row,
   `party_size` is what they answer). Columns:
   - `vip` TRUE → invited to both weddings, answers yes/no for each.
   - `gender` M/F → splits the men's/women's hammam lists in the dashboard.
   - `invit_hammam`, `invit_soiree` TRUE/FALSE → whether the form shows those
     questions. Editable at any time; the form reflects the flags live.
   - `importance` → free ranking column for your own planning (number or label);
     the form ignores it, the dashboard shows it.
   - `lang` → per-guest site language: empty or `fr` = French, `en` = English.
     The guest can still switch manually on the page.
   - `plus_one` TRUE/FALSE → whether this guest may bring an optional +1. Only
     guests with TRUE see the "+1" checkbox; nobody can add an unlimited number.
   - `places` → base party size for this invitation (default 1). Set **2** for a
     couple, **3+** for a family — they're counted automatically, no checkbox.
     Name the row for the whole party (e.g. "Amine & Sana"). A `plus_one` on top
     adds one more.
2. Leave `token` empty, then run **`generateTokens`** in Apps Script.
3. Each guest's personal link is `https://<user>.github.io/wedding-planner/?g=<token>`.
   Message templates in [`templates/messages.md`](templates/messages.md).

## 5. Dashboard

`https://<user>.github.io/wedding-planner/admin.html?key=<admin_key>` — counts,
per-event lists, all answers, and the map. For map pins, run
**`geocodeResponses`** in Apps Script from time to time (it geocodes new cities
via OpenStreetMap, 1/second, and caches the result in the sheet).

## Rules enforced by the backend

- One answer per personal link; unknown token → rejected.
- Non-VIP cannot say yes to both weddings.
- Hammam / women's-ceremony answers only accepted if the guest is invited to them.
- **24h edit window** from the first submission (per phase); afterwards → rejected.
- **Capacity** (rsvp phase only): submissions that would exceed a venue's capacity
  are refused, under a script lock, so simultaneous answers cannot overshoot.
