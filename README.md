# TechPulse

TechPulse shows the **current status of the technical services people depend on** in one place:
whether a service is up, degraded, partially or fully down, under maintenance — plus what is
affected, when it started, how long a check took, and which source said so.

Two things are never mixed up:

| | What it means | Who produces it |
| --- | --- | --- |
| **Official Status** | What the vendor publishes (Statuspage, status.io, official API/RSS) | the vendor |
| **Our Check** | HTTP/HTTPS, DNS, TCP and optional ICMP measurements | the TechPulse collector |

If a vendor says "Operational" while our own check fails, the UI shows both. Our check never
overrides the vendor, and a vendor field we cannot read is reported as `UNKNOWN` — never as
operational.

---

## بالعربية (نبض التقنية)

نبض التقنية منصّة تعرض الحالة الحالية للخدمات التقنية في مكان واحد: هل تعمل؟ هل يوجد تدهور في
الأداء؟ انقطاع جزئي أو كامل؟ صيانة؟ وما المكوّنات المتأثرة، وما آخر حادث ومتى بدأ، وزمن الاستجابة
لكل فحص، ومصدر المعلومة.

* **الواجهة عربية بالكامل** مع دعم الاتجاه من اليمين لليسار، ويمكن التبديل إلى الإنجليزية بزر واحد،
  وكل خدمة لا تنشر مصدرًا مقروءًا آليًا مذكورة بسببه بالعربية.
* **تطبيق أندرويد (APK)** جاهز: `dist/TechPulse-1.0.0-ar.apk` باسم «نبض التقنية». يعمل التطبيق
  بواجهته المدمجة، ويقرأ البيانات من خادم نبض التقنية، ويعرض آخر لقطة محفوظة داخله عند تعذّر
  الوصول إلى الخادم.
* الفصل صريح بين **الحالة الرسمية** للمزوّد و**فحوص الاتصال** التي نقيسها بأنفسنا.

---

## Project overview

* 38 services across five categories: **Gaming, AI, Cloud, Social, Media**.
* 24 of them have a verified machine-readable official source; the rest are clearly labelled as
  connectivity-only (the reasons are documented per service and shown in the UI).
* Background collector → database/cache → REST API → dashboard. The browser never talks to a
  third-party status API.
* Every source, including the ones that were ruled out, is documented in
  [`docs/data-sources.md`](docs/data-sources.md) with the raw evidence saved under
  `tools/research/`.

## Architecture

```
Collector (background worker)
  ├── Connectors ──► official status APIs / RSS / JSON / XML
  └── Latency engine ──► HTTP, HTTPS, DNS, TCP, ICMP
            │
            ▼
      Normalise + health engine  (unified status, thresholds, events)
            │
            ▼
        SQLite database (history, components, incidents, checks)
            │
            ▼
        Backend API (Fastify)  ──►  Dashboard (React + Vite)
```

* `packages/core` — domain types, unified status mapping, health engine, HTTP/XML/RSS helpers,
  environment configuration and the service catalog.
* `packages/db` — SQLite schema and repositories (`node:sqlite`, no native dependency).
* `packages/connectors` — one small module per source family; each returns the same result shape.
* `apps/collector` — scheduler, connectors, latency engine, event engine.
* `apps/api` — REST API, admin/developer API, static hosting of the built dashboard.
* `apps/web` — React dashboard (dark-first, responsive, no UI framework).

## Installation

Requirements: **Node.js ≥ 24** (uses the built-in `node:sqlite` and native TypeScript execution).

```bash
cd D:\AIProjects\Pro2
npm install
cp .env.example .env      # optional: adjust ports, thresholds, admin token
npm run seed              # creates data/techpulse.db and loads the catalog
npm run collector:once    # one full collection pass (needs internet access)
npm run web:build         # builds the dashboard into apps/web/dist
npm run api               # serves API + dashboard on http://127.0.0.1:4310
```

## Development

```bash
npm run collector          # continuous collector loop (5 s tick, per-source intervals)
npm run collector:once     # single pass, then exit
npm run collector -- --service=github   # single service (use: node apps/collector/src/index.ts --once --service=github)
npm run api                # API + built dashboard
npm run web:dev            # Vite dev server on :5173 (proxies /api to :4310)
npm run typecheck          # tsc --noEmit, strict
npm test                   # node:test suites (offline, fixture based)
npm run verify             # typecheck + tests + web build
```

TypeScript is executed directly by Node (type stripping), so there is no build step for the
server code. Imports use explicit `.ts` extensions and the code stays inside the erasable-syntax
subset (no enums, no parameter properties).

## Environment variables

Copy `.env.example` to `.env` (never committed) and adjust as needed:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TECHPULSE_API_HOST` / `TECHPULSE_API_PORT` | `127.0.0.1` / `4310` | API bind address |
| `TECHPULSE_WEB_ORIGIN` | `http://localhost:4310` | CORS origin for the dashboard |
| `TECHPULSE_DB_PATH` | `./data/techpulse.db` | SQLite file |
| `TECHPULSE_COLLECTOR_CONCURRENCY` | `6` | Parallel service collections |
| `TECHPULSE_DEFAULT_POLL_SECONDS` | `60` | Default per-service poll interval |
| `TECHPULSE_CONNECTIVITY_POLL_SECONDS` | `30` | Latency check interval |
| `TECHPULSE_COLLECTOR_REGION` | `local` | Region label stored with each check |
| `TECHPULSE_ICMP_ENABLED` | `false` | Run `ping` as an additional latency signal |
| `TECHPULSE_DEGRADED_AFTER_FAILURES` | `2` | Failures before DEGRADED |
| `TECHPULSE_DOWN_AFTER_FAILURES` | `4` | Failures before MAJOR_OUTAGE |
| `TECHPULSE_DEGRADED_LATENCY_MS` | `1200` | Latency considered degraded |
| `TECHPULSE_MAJOR_OUTAGE_LATENCY_MS` | `3000` | Latency considered severely degraded |
| `TECHPULSE_CHECK_TIMEOUT_MS` | `10000` | Timeout per request/check |
| `TECHPULSE_ADMIN_TOKEN` | *(empty)* | Enables the developer API; empty = disabled |
| `RIOT_API_KEY` | *(empty)* | Optional, only needed to read Riot's platform status API |

Secrets live only in `.env` / the process environment. They are never logged (the logger redacts
`api_key`, `token`, `secret`, `password`, `authorization` and `bearer` patterns) and never sent to
the browser. The admin API can additionally be turned off entirely by leaving the token empty.

## Database

SQLite (WAL) with these tables: `categories`, `services`, `sources`, `service_status`,
`status_history`, `components`, `incidents`, `checks`, `connectivity_status`, `events`,
`connector_runs`, `regions`, `settings`.

Design notes:

* `service_status` holds the **official** status only; `connectivity_status` holds our own verdict.
* `checks` keeps every individual measurement (`kind`, `target`, `latency_ms`, `status_code`,
  `error`, `region`, `checked_at`), so HTTP/DNS/TCP/ICMP are never blended together.
* `status_history` records state changes plus a 30-minute heartbeat per service.
* Retention is enforced by the collector (`pruneOldData`: checks 14 days, status history 90 days,
  connector runs 7 days).
* The service catalog lives in code (`packages/core/src/catalog.ts`) and is re-seeded on every
  collector/API start; runtime additions from the admin API live only in the database.

## Connectors

| Connector | Source type | Services |
| --- | --- | --- |
| `statuspage` | Atlassian Statuspage `/api/v2/*` | Epic Games, Fortnite, Discord, OpenAI, Anthropic/Claude, Groq, Cloudflare, GitHub, Vercel, DigitalOcean, Reddit |
| `statusio` | status.io public API | Roblox |
| `betterstack` | Better Stack status page JSON | Hugging Face |
| `rss-feed` | official RSS | DeepSeek, Microsoft Azure, TMDB |
| `google-cloud` | Google Cloud incidents JSON | Google Cloud, Google AI/Gemini |
| `aws-health` | AWS Health public events (UTF-16 JSON) | AWS |
| `xbox-status` | Xbox `xnotify` service status (JSON + XML) | Xbox Network |
| `nuvio-status` | Nuvio status API | Nuvio |
| `uptime-json` | status page monitor JSON | Trakt, Simkl |
| `steam-api` | Steam Web API (`ISteamWebAPIUtil`) | Steam |
| `connectivity` | no machine-readable source — our checks only | PlayStation, Nintendo, Riot, EA, Ubisoft, Battle.net, WhatsApp, Instagram, Facebook, X, TikTok, Telegram, Minecraft, Stremio |

A connector returns only what its source actually supports (`status`, `components`, `incidents`,
`maintenance`, `regions`, `metadata`). Nothing is invented to fill a field.

## Adding a service

1. Verify a real source first (see `docs/data-sources.md` for the method and the ladder used).
2. Add one entry to `packages/core/src/catalog.ts`:

```ts
{
  slug: 'example',
  name: 'Example',
  category: 'cloud',
  homepage: 'https://example.com',
  statusPage: 'https://status.example.com',
  connector: 'statuspage',
  connectorConfig: { baseUrl: 'https://status.example.com' },
  sourceKind: 'statuspage',
  official: true,
  confidence: 'high',
  checkTargets: [https('https://example.com/')],
}
```

3. Run `npm run seed` (or restart the collector). The service then appears automatically in its
   category, the dashboard, search and the admin API.

If a new **source family** is needed, add one module in `packages/connectors/src/`, register it in
`packages/connectors/src/index.ts`, and add its id to `ConnectorId`. Services without a
machine-readable source use the `connectivity` connector and must include a `limitation` string.

## Testing

`npm test` runs everything with Node's built-in test runner, fully offline:

* `packages/core` — status mapping (Statuspage/status.io/free text), `UNKNOWN` is never upgraded,
  health engine escalation (1 failure ≠ outage), latency separation, SSRF guard, XML/RSS parsing,
  catalog integrity.
* `packages/db` — catalog seeding, status/component/incident persistence, history semantics,
  search, enable/disable.
* `packages/connectors` — every connector is exercised against **real captured payloads** in
  `packages/connectors/test/fixtures/` (including the UTF-16 AWS feed and both Xbox
  representations) through a fixture-backed `fetch`.
* `apps/api` — endpoint behaviour, 404s, admin auth, SSRF rejection, security headers, static
  content types.
* `apps/collector` — event engine transitions.

## Production

```bash
npm run verify                       # typecheck + tests + web build
npm run api                          # serves the built dashboard and the API
npm run collector                    # run under a supervisor / service manager
```

* Bind the API behind a reverse proxy; set `TECHPULSE_ADMIN_TOKEN` only if the developer API is
  needed, and keep it out of the browser build.
* Set `TECHPULSE_ICMP_ENABLED=true` only where raw ICMP is permitted; a blocked ICMP probe is
  recorded as `icmp-unavailable` and is never treated as an outage.
* Latency is measured from the machine running the collector. Region labels are honest: the MVP
  ships one central collector (`regions` table, probe id `local`) and the schema is ready for
  additional regional probes.
* `docs/data-sources.md` documents the polling policy per source class; all third-party traffic
  happens in the collector, never per user request.

## Android app (APK)

The APK is a thin Android shell (no third-party libraries) that bundles the **Arabic web build**
and the offline snapshot inside `assets/www`, and loads them from `file:///android_asset/www/index.html`.

* Package: `com.techpulse.status` · label: **نبض التقنية** (Arabic) / TechPulse (English)
* `minSdk 24`, `compileSdk`/`targetSdk 36`, Java 17 source level, signed with the debug keystore
* The app asks for the TechPulse server address once (`#/settings` or the gear entry in the nav);
  the default points at the machine running the collector on the local network
* If that server cannot be reached, the dashboard keeps working from the bundled snapshot and shows
  the "saved data" banner; the app also has `INTERNET` permission and allows cleartext HTTP so a
  local server works out of the box

Build it (the toolchain used on this machine):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

npm run snapshot         # apps/web/public/snapshot.json  (offline fallback)
npm run web:build        # apps/web/dist
npm run android:assets   # copies dist into android/app/src/main/assets/www
npm run android:release  # gradle assembleRelease -> android/app/build/outputs/apk/release/app-release.apk
```

`npm run android:apk` runs the whole chain. Install on a device with
`adb install -r android/app/build/outputs/apk/release/app-release.apk`.

To let a phone reach the API, run the server on all interfaces (`.env`):

```
TECHPULSE_API_HOST=0.0.0.0
TECHPULSE_API_PORT=4310
```

and enter `http://<your-lan-ip>:4310` in the app settings (Windows Firewall must allow the port).

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dashboard says "No data yet" and `/api/overview` returns `services: 0` | database not seeded | `npm run seed` |
| A service shows `Unknown` with "official status unknown" | vendor has no machine-readable source | expected; see its limitation text |
| `[Steam] check failed: https Store ... timeout` | transient network/timeout | single failures are recorded as warnings, not outages |
| `icmp ping: not measured` | ICMP disabled or blocked | set `TECHPULSE_ICMP_ENABLED=true`, or ignore — ICMP is optional |
| Admin endpoints return 503 | `TECHPULSE_ADMIN_TOKEN` is empty | set the variable and restart the API |
| Vite dev server shows 404 on `/api/*` | API not running | start `npm run api` (proxy target `127.0.0.1:4310`) |
| Web build fails with a permissions error inside `node_modules/.vite-temp` | restricted filesystem sandbox | run the build from a normal shell |

## Services

Status column: **official** = machine-readable vendor source, **check** = our connectivity checks
only (the vendor publishes no readable feed), **live/incidents** = what the source provides.

| Service | Category | Source | Source type | Official? | Auth? | Status | Latency | Incidents | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Steam | Gaming | `api.steampowered.com/ISteamWebAPIUtil/GetServerInfo` | Official API | yes | no | official | yes | no | liveness only; no official incident feed |
| PlayStation Network | Gaming | `status.playstation.com` (feed unreachable) | Official page | yes | no | check | yes | no | region feed returns 404/503 |
| Xbox Network | Gaming | `xnotify.xboxlive.com/servicestatusv6` | Official API (JSON/XML) | yes | no | official | yes | scenarios | 11 service categories |
| Nintendo Network | Gaming | `nintendo.co.jp/netinfo` | Official page | yes | no | check | yes | no | human-readable maintenance info only |
| Epic Games | Gaming | `status.epicgames.com` | Statuspage | yes | no | official | yes | yes | components + maintenance |
| Fortnite | Gaming | Epic Games Statuspage (filtered) | Statuspage | yes | no | official | yes | yes | Fortnite components only |
| Riot Games | Gaming | `status.riotgames.com`, keyed platform API | Official page / keyed API | yes | key | check | yes | no | API returns 401 without `RIOT_API_KEY` |
| EA | Gaming | `ea.com/service-updates` | Official page + undocumented GraphQL | yes | no | check | yes | no | GraphQL rejects introspection |
| Ubisoft | Gaming | `ubisoft.com/en-us/help/status` | Official page | yes | no | check | yes | no | no public API |
| Battle.net | Gaming | `account.battle.net/status` | Official page + auth-only API | yes | session | check | yes | no | `/api/status` → 401 |
| Roblox | Gaming | `api.status.io/1.0/status/59db90…` | status.io API | yes | no | official | yes | yes | page hosted on status.io |
| Minecraft | Gaming | — | — | no | — | check | yes | no | `status.mojang.com` retired |
| Discord | Gaming | `discordstatus.com` | Statuspage | yes | no | official | yes | yes | |
| OpenAI | AI | `status.openai.com` | Statuspage | yes | no | official | yes | yes | |
| Anthropic / Claude | AI | `status.claude.com` | Statuspage | yes | no | official | yes | yes | `status.anthropic.com` redirects here |
| Google AI / Gemini | AI | `status.cloud.google.com/incidents.json` | Official JSON | yes | no | official | yes | yes | Gemini/Vertex products filtered |
| DeepSeek | AI | `status.deepseek.com/feed.rss` | Official RSS | yes | no | official | yes | yes | Flashcat status page |
| Groq | AI | `groqstatus.com` | Statuspage | yes | no | official | yes | yes | |
| Hugging Face | AI | `status.huggingface.co/index.json` | Better Stack JSON | yes | no | official | yes | yes | sections + resources |
| Cloudflare | Cloud | `cloudflarestatus.com` | Statuspage | yes | no | official | yes | yes | |
| GitHub | Cloud | `githubstatus.com` | Statuspage | yes | no | official | yes | yes | |
| AWS | Cloud | `health.aws.amazon.com/public/currentevents` | Official JSON (UTF-16) | yes | no | official | yes | yes | per-region components |
| Microsoft Azure | Cloud | `azure.status.microsoft/en-us/status/feed/` | Official RSS | yes | no | official | yes | yes | empty feed = no active events |
| Google Cloud | Cloud | `status.cloud.google.com/incidents.json` | Official JSON | yes | no | official | yes | yes | product-level detail |
| Vercel | Cloud | `vercel-status.com` | Statuspage | yes | no | official | yes | yes | |
| DigitalOcean | Cloud | `status.digitalocean.com` | Statuspage | yes | no | official | yes | yes | |
| WhatsApp | Social | `metastatus.com` | Official page | yes | no | check | yes | no | client-rendered, no public JSON |
| Instagram | Social | `metastatus.com` | Official page | yes | no | check | yes | no | same limitation |
| Facebook | Social | `metastatus.com` | Official page | yes | no | check | yes | no | same limitation |
| X | Social | — | — | no | — | check | yes | no | no official status surface |
| TikTok | Social | — | — | no | — | check | yes | no | no official status surface |
| Reddit | Social | `redditstatus.com` | Statuspage | yes | no | official | yes | yes | |
| Telegram | Social | — | — | no | — | check | yes | no | no official status surface |
| Nuvio | Media | `status.nuvio.tv/api/status` | Official JSON | yes | no | official | yes | yes | components + uptime history |
| Stremio | Media | — | — | no | — | check | yes | no | no status page |
| TMDB | Media | `status.themoviedb.org/rss` | Official RSS (StatusIQ) | yes | no | official | yes | yes | per-component status reports |
| Trakt | Media | `status.trakt.tv/api/getMonitorList/…` | Official JSON | yes | no | official | yes | yes | monitors + event feed |
| Simkl | Media | `status.simkl.com/api/getMonitorList/…` | Official JSON | yes | no | official | yes | yes | monitors + event feed |

## Security

* **SSRF protection** — `isAllowedPublicUrl` rejects non-HTTP(S) schemes, credentials in URLs,
  localhost, RFC1918 ranges, link-local (`169.254.0.0/16`, cloud metadata), `.internal` and
  `.local` hosts. Admin URL testing uses the same guard.
* **Input validation** — service slugs, categories, connectors and check targets are validated
  before anything is stored.
* **Rate limiting** — 180 requests/minute per IP on all routes.
* **Secure headers** — CSP, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policy
  on every response.
* **Error sanitisation** — 5xx responses return a generic message; details stay in the log.
* **Secret management** — `.env` only, `.gitignore`d, redacted in logs, never returned by the API.

## License

Internal project — no license has been granted for redistribution.
