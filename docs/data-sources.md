# TechPulse — Data Sources (Phase 1 research record)

Verification date: **2026-09-19** (Asia/Riyadh). Every endpoint below was requested from this
machine with real network calls; nothing here is assumed or copied from another project.

Raw evidence is stored under `tools/research/`:

| Artifact | What it contains |
| --- | --- |
| `tools/research/probe.mjs` … `probe7.mjs` | the probes that were executed (7 passes, 170+ HTTP requests) |
| `tools/research/probe-report.json` … `probe7-report.json` | status code, content type, size, latency, parsed keys, JS-bundle endpoint discoveries |
| `tools/research/raw/` | raw response bodies kept as fixtures (JSON/XML/HTML/RSS) |

## 1. Method

For every service the following ladder was walked, in order, until a machine-readable
official source was found:

1. Official API → 2. Official status API → 3. Statuspage-style API (`/api/v2/*`) →
4. Official RSS/Atom → 5. Official JSON endpoint → 6. Official status page →
7. Direct HTTP/HTTPS → 8. DNS → 9. TCP → 10. ICMP → 11. external source (only if unavoidable).

Status pages that render client-side were inspected by fetching their JavaScript bundles and
extracting the endpoints the page itself calls (`probe2` … `probe7`). Endpoints that could not be
reached are recorded as **not publicly reachable**, never invented.

Two facts are kept strictly separate in the product:

* **Official Status** — what the vendor publishes.
* **Our Check** — HTTP/DNS/TCP/ICMP measurements taken by the TechPulse collector.

Our check never overwrites the official status. When a vendor publishes no machine-readable
status at all, the official status is `UNKNOWN` and only `Our Check` is reported.

## 2. Verified sources

Legend — *Auth*: API key or token required. *Conf.*: confidence assigned to the source
(High = official machine-readable API/RSS, Medium = official page or derived from our own check,
Low = community/unofficial).

### 2.1 Gaming

| Service | Source | URL | Type | Official | Auth | Components | Incidents | Maint. | Conf. | Last verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Steam | Steam Web API — `ISteamWebAPIUtil/GetServerInfo` | `https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/` | Official API (JSON) | yes | no | no | no | no | Medium | 2026-09-19 |
| PlayStation Network | Status page + `config/app.json` (feed not reachable) | `https://status.playstation.com/config/app.json` | Official page/config | yes | no | no | no | no | Medium | 2026-09-19 |
| Xbox Network | `xnotify` service status (what support.xbox.com reads) | `https://xnotify.xboxlive.com/servicestatusv6/{market}/{locale}` (e.g. `US/en-US`) | Official API (XML) | yes | no | v4 `CoreServices` | yes (scenarios) | no | High | 2026-09-19 |
| Nintendo Network | Support region selector + JP network-info page | `https://support.nintendo.com/status`, `https://www.nintendo.co.jp/netinfo/ja_JP/index.html` | Official pages (HTML) | yes | no | no | no | JP page lists maintenance | Medium | 2026-09-19 |
| Epic Games | Statuspage | `https://status.epicgames.com/api/v2/{status,components,incidents,scheduled-maintenances}.json` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| Fortnite | Epic Games Statuspage (Fortnite components) | `https://status.epicgames.com/api/v2/components.json` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| Riot Games | Status page is client-rendered; official LoL platform-status API needs a key | `https://status.riotgames.com/`, `https://{platform}.api.riotgames.com/lol/status/v4/platform-data` | Official page / keyed API | yes | **yes** (Riot API key) | unknown | unknown | unknown | Medium | 2026-09-19 |
| EA | Service-updates page backed by undocumented GraphQL | `https://www.ea.com/service-updates`, `https://service-aggregation-layer.juno.ea.com/graphql` | Official page + undocumented GraphQL | yes (page) | no | unknown | unknown | unknown | Low | 2026-09-19 |
| Ubisoft | Help/status page, no public API discovered | `https://www.ubisoft.com/en-us/help/status` | Official page (HTML) | yes | no | no | no | no | Low | 2026-09-19 |
| Battle.net | Account status page; `/api/status` answered 401 | `https://account.battle.net/status` | Official page + auth-only API | yes | yes (session) | no | no | no | Low | 2026-09-19 |
| Roblox | Status page is hosted on status.io; public API works | `https://api.status.io/1.0/status/59db90dbcdeb2f04dadcf16d` | Status.io API (JSON) | yes | no | yes (containers) | yes | no | High | 2026-09-19 |
| Minecraft | `status.mojang.com` is retired (DNS NXDOMAIN) — no official feed | `https://status.mojang.com/` | — | — | — | — | — | — | Medium (our check) | 2026-09-19 |
| Discord | Statuspage | `https://discordstatus.com/api/v2/{status,components,incidents}.json` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |

### 2.2 AI

| Service | Source | URL | Type | Official | Auth | Components | Incidents | Maint. | Conf. | Last verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | Statuspage | `https://status.openai.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| Anthropic / Claude | Statuspage (status.anthropic.com redirects here) | `https://status.claude.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| Google AI / Gemini | Google Cloud status feed (Gemini/Vertex run under Google Cloud) | `https://status.cloud.google.com/incidents.json` | Official JSON | yes | no | partial (products) | yes | no | Medium | 2026-09-19 |
| DeepSeek | Status page (Flashcat) — machine-readable RSS | `https://status.deepseek.com/feed.rss` | Official RSS | yes | no | no | yes | yes | High | 2026-09-19 |
| Groq | Statuspage | `https://groqstatus.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| Hugging Face | Better Stack status page | `https://status.huggingface.co/index.json` (+ `feed.rss`) | Official JSON API | yes | no | yes | yes | yes | High | 2026-09-19 |

### 2.3 Cloud / Infrastructure

| Service | Source | URL | Type | Official | Auth | Components | Incidents | Maint. | Conf. | Last verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cloudflare | Statuspage | `https://www.cloudflarestatus.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| GitHub | Statuspage | `https://www.githubstatus.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| AWS | AWS Health public events feed (+ status RSS) | `https://health.aws.amazon.com/public/currentevents`, `https://status.aws.amazon.com/rss/all.rss` | Official JSON (UTF-16) / RSS | yes | no | yes (service + region) | yes | no | High | 2026-09-19 |
| Microsoft Azure | Azure status RSS feed + status page | `https://azure.status.microsoft/en-us/status/feed/` | Official RSS | yes | no | no | yes | no | High | 2026-09-19 |
| Google Cloud | Google Cloud incidents feed | `https://status.cloud.google.com/incidents.json` | Official JSON | yes | no | yes (products) | yes | no | High | 2026-09-19 |
| Vercel | Statuspage | `https://www.vercel-status.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| DigitalOcean | Statuspage | `https://status.digitalocean.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |

### 2.4 Social

| Service | Source | URL | Type | Official | Auth | Components | Incidents | Maint. | Conf. | Last verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WhatsApp | Meta status page (client-rendered, no public JSON found) | `https://metastatus.com/` | Official page (HTML/JS) | yes | no | page only | page only | page only | Low | 2026-09-19 |
| Instagram | Meta status page / Graph API dashboard (404) | `https://metastatus.com/` | Official page (HTML/JS) | yes | no | page only | page only | page only | Low | 2026-09-19 |
| Facebook | Meta status page / Graph API dashboard (404) | `https://metastatus.com/` | Official page (HTML/JS) | yes | no | page only | page only | page only | Low | 2026-09-19 |
| X | No official status surface (`status.twitter.com`, `status.x.com` do not resolve; community `api.twitterstat.us` returns 401 “page inactive”) | — | — | — | — | — | — | — | Medium (our check) | 2026-09-19 |
| TikTok | No official status page found (`status.tiktok.com` NXDOMAIN, `developers.tiktok.com/status` 404) | — | — | — | — | — | — | — | Medium (our check) | 2026-09-19 |
| Reddit | Statuspage | `https://www.redditstatus.com/api/v2/*` | Statuspage API | yes | no | yes | yes | yes | High | 2026-09-19 |
| Telegram | No official status page (`status.telegram.org` is not a status surface) | — | — | — | — | — | — | — | Medium (our check) | 2026-09-19 |

### 2.5 Media

| Service | Source | URL | Type | Official | Auth | Components | Incidents | Maint. | Conf. | Last verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nuvio | Nuvio status API + API health endpoint | `https://status.nuvio.tv/api/status`, `https://api.nuvio.tv/` | Official JSON | yes | no | yes | yes (active + past) | no | High | 2026-09-19 |
| Stremio | No status page (`status.stremio.com` NXDOMAIN); `api.strem.io` reachable for checks | `https://www.stremio.com/` | — | — | — | — | — | — | Medium (our check) | 2026-09-19 |
| TMDB | StatusIQ (Site24x7) status page RSS | `https://status.themoviedb.org/rss` | Official RSS | yes | no | no | yes | yes | High | 2026-09-19 |
| Trakt | Status page JSON API | `https://status.trakt.tv/api/getMonitorList/wVLWNFLGN9`, `…/api/getEventFeed/wVLWNFLGN9` | Official JSON | yes | no | yes (monitors) | yes (event feed) | yes | High | 2026-09-19 |
| Simkl | Status page JSON API | `https://status.simkl.com/api/getMonitorList/Nx8xTN71j`, `…/api/getEventFeed/Nx8xTN71j` | Official JSON | yes | no | yes (monitors) | yes (event feed) | yes | High | 2026-09-19 |

## 3. Coverage summary

| Outcome | Count | Services |
| --- | --- | --- |
| Official machine-readable source (API/JSON/RSS/XML) | 24 | Steam (API), Xbox, Epic Games, Fortnite, Roblox, Discord, OpenAI, Anthropic/Claude, Google AI/Gemini, DeepSeek, Groq, Hugging Face, Cloudflare, GitHub, AWS, Azure, Google Cloud, Vercel, DigitalOcean, Reddit, Nuvio, TMDB, Trakt, Simkl |
| Official human-readable page only — status shown as `UNKNOWN`, our check reported | 9 | PlayStation Network, Nintendo Network, Riot Games, EA, Ubisoft, Battle.net, WhatsApp, Instagram, Facebook |
| No official status surface at all — our check only | 5 | Minecraft, X, TikTok, Telegram, Stremio |
| Blocked / needs a key | — | Riot (needs Riot API key), Battle.net (needs session), steamstat.us (HTTP 403 to non-browser clients) |

## 4. Explicit limitations recorded during research

1. **Steam** publishes no status/incident feed. `steamstat.us` is community-run and blocked our
   requests with HTTP 403, so it is *not* used. Steam's official API is used as a liveness signal
   plus direct connectivity checks.
2. **PlayStation** `config/app.json` shows the status page fetches
   `https://status.playstation.com/data/statuses/region/{region}.json`, but every variant tried
   (`us`, `US`, `americas`, `1`, `all`, with and without `X-User-Geo-Country`) returned HTTP 404
   and `/api/status` returned 503. The feed is therefore treated as not publicly reachable.
3. **Riot**: `status.riotgames.com/api/v2/*` only serves the page's internal logging endpoints.
   The official platform-status endpoint returns HTTP 401 without an API key.
4. **EA**: `service-aggregation-layer.juno.ea.com/graphql` rejects introspection
   (`{"errors":[{"message":"Graphql validation error"}]}`), so no reliable query can be built.
5. **Meta**: `metastatus.com` is a client-rendered Next.js app; `/metrics/{t}/{i}.json` exists but
   the parameters are not discoverable, and every other path returns the HTML shell.
6. **Nintendo**: `support.nintendo.com/status` is a region selector, `nintendo.com/us/support/network-status`
   returns 404 and `en-americas-support.nintendo.com` returns 406. Only the Japanese network-info
   page is usable as a human-readable reference.
7. **AWS**' public events feed is UTF-16 encoded — the collector must decode it explicitly.
8. **Azure**'s RSS feed is empty when there are no active events; an empty feed is a valid
   "no incidents" signal, not a failure.
9. Google's **Gemini** has no dedicated status page; Google Cloud incidents that list the
   Generative Language API / Vertex AI products are used and labelled as such.

## 5. Polling policy derived from this research

| Source class | Interval | Rationale |
| --- | --- | --- |
| Statuspage API (17 services) | 60 s | published JSON, no auth, no documented rate limit |
| status.io / Better Stack / StatusIQ / Flashcat / uptime JSON | 60–120 s | small JSON/RSS documents |
| AWS Health, Azure RSS, Google Cloud JSON | 60 s | large but cached; feed updates are event driven |
| Keyed or page-only sources | 300 s | only used for metadata / manual checks |
| Connectivity checks (HTTP/DNS/TCP/ICMP) | 30–60 s | cheap, and the only signal for the 14 services without an official feed |

All polling is done by the background collector; user requests never hit third-party APIs.
