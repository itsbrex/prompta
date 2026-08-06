# Prompta

A local-first chat UI for LLM APIs. All data lives in browser-side SQLite (cr-sqlite compiled to
WASM), optionally synced across devices via CRDTs. Ships as a web app (`chat.prompta.dev`) and a
Tauri desktop app from the same codebase.

**This project is archived.** See the note at the top of `README.md`. The web app stays online but
no new work is planned. Prefer minimal, surgical changes.

## Commands

```bash
bun install
bun run dev              # vite dev server, browser only
bun run dev:tauri        # desktop app (requires Rust toolchain)
bun run ui:build-static  # browser-only production build, no Rust needed
bun run build            # full tauri build
bun run check            # svelte-check typecheck
bun run test:browser     # playwright; needs a live API and a running dev server
bun run dev:server       # local sync server on :8081
```

`bun` is the supported package manager. Releases are cut with `bun run release` (prompts for a
version); pushing a `v*` tag triggers `.github/workflows/main.yml` to build and publish desktop
binaries.

## Architecture

| Concern         | Location                                                                     |
| --------------- | ---------------------------------------------------------------------------- |
| Data layer      | `src/lib/db.ts` — hand-rolled ORM over cr-sqlite                              |
| App state       | `src/lib/stores/stores/index.ts` — threads, messages, sync orchestration      |
| LLM clients     | `src/lib/llm/openai.ts` — provider definitions and the Anthropic shim         |
| Provider config | `src/lib/stores/stores/llmProvider.ts`                                        |
| Sync client     | `src/lib/sync/vlcn.ts` ↔ `sync-server/` (Fastify) — but see "Backend service" |
| Desktop shell   | `src-tauri/` (Rust, Tauri v2)                                                 |
| Platform API    | `src/lib/gui/` — `getSystem()` returns `native.ts` or `browser.ts` at runtime |

UI is SvelteKit 2 / Svelte 5 with `adapter-static` (no SSR — the whole app assumes a browser with
`localStorage` and WASM). Tailwind, plus shadcn-style primitives under `src/lib/components/ui/`.

### Database

`src/lib/db.ts` exposes a generic `crud<T>()` factory (`findMany` / `upsert` / `softDelete` /
`initRx`) instantiated as `Thread`, `ChatMessage`, `LLMProvider`, `Fragment`. Things that will bite
you if you don't know them:

- **The schema is fetched by URL at runtime.** `import schema_0002 from "$lib/migrations/0002_schema.sql?url"`,
  then applied via cr-sqlite's `automigrateTo`. This is why `vite.config.ts` sets
  `assetsInlineLimit: 0` — asset inlining breaks migrations. To change the schema, copy the SQL file
  to a new numbered file, edit it, and point `schemaUrl` at it. Never edit an applied schema in
  place: the name is part of the sync handshake and old schemas must remain intact.
- **DB names are an append-only list in `localStorage`** (`prompta--dbNames`, values `chat_db-vN`).
  A "hard reset" appends a new name rather than deleting anything, so prior data stays recoverable
  through `importFromDatabase` / `reinstatePriorData`.
- **All synced tables are CRDTs** (`SELECT crsql_as_crr('...')`). Deletes are therefore soft: rows
  are copied into `deleted_record` before removal, because CRDT deletes merge badly.
- **Search is fragment-based.** Message and thread text is shredded into rows in `fragment`, mirrored
  into a `fragment_fts` FTS5 trigram table by triggers. The shredding happens in debounced table
  listeners at the bottom of `db.ts` (`syncThreadFragments`, `syncMessageFragments`), which also
  drive `syncStore.pushChanges`. Queries shorter than 3 chars fall back to a `LIKE` search on thread
  titles only.

### LLM providers

**Every provider requires a user-supplied API key.** There is deliberately no key-less option — the
hosted "Prompta" proxy that used to fill that role was removed once its backend went dead. A new
user starts with nothing configured and must either sign in with OpenRouter or paste a key.

There are exactly two ways to get inference, and the code should stay that way:

1. **OpenRouter** — the single entry in `defaultProviders` (`llm/openai.ts`). It is special *only*
   because it can mint its own key via OAuth.
2. **Any OpenAI-compatible endpoint** the user adds, stored in the `llm_provider` table.

OpenAI and Anthropic used to be built-ins with dedicated cards, model-picker entries, command-menu
actions and hardcoded default model ids. That's all gone — OpenAI is now just a custom provider
pointed at `https://api.openai.com/v1/`. Don't reintroduce per-provider branching; anything that
needs to vary by provider should be data (see `builtInProviderMeta`), not a chain of `if`s.

**There is no direct Anthropic support.** Anthropic's native API isn't OpenAI-compatible, so it
can't be a custom provider; the `AnthropicClient` translation shim was deleted along with the
built-in (recoverable from git if ever needed). Claude is reachable through OpenRouter.

`chatModels.refresh()` filters to `enabled && apiKey`, so a keyless provider is unusable regardless
of its enabled flag. Zero usable providers is the expected empty state, not an error — don't
reintroduce an error toast or auto-open the settings modal for it; the composer shows a "Set up"
button instead.

#### OpenRouter OAuth

`llm/openrouter.ts` implements the PKCE flow. **It is not session auth**: the exchange returns a
durable user-owned API key (`{"key": "..."}`), which is stored exactly like a pasted one. No access
token, no expiry, no refresh — don't add token-refresh machinery. The callback lands on `/` and is
handled in `+layout.svelte` after the db is ready (completing auth refreshes the model list, which
reads the database). The code is stripped from the URL immediately so a refresh can't replay it.

OAuth is browser-only. The desktop build has no HTTP origin for OpenRouter to redirect back to, so
Tauri falls back to opening `openrouter.ai/keys` externally for a manual paste. Real desktop support
would need `tauri-plugin-deep-link` and a registered custom scheme.

Everything downstream talks to one interface, `MinimalLLMClient` (`db.ts`). `AnthropicClient`
implements it by translating Anthropic's API into the OpenAI request/response/stream shape, so the
chat code never branches on provider.

`openAiFetchWrapper` strips all but a whitelist of headers, because the OpenAI SDK's custom headers
cause CORS preflight failures against third-party endpoints (and Safari objects to `User-Agent`).

### Sync

Pull-then-push of encoded cr-sqlite changesets over plain HTTP. Watermarks (`last-sent-to-*`,
`last-seen-from-*`) are kept in `localStorage`. A "sync chain" is just a room string — anyone with
it can read the data. The client verifies a server with `GET /health` (expects `{status:"ok",n:47}`)
and registers its schema via `POST /schema` before syncing. Default endpoint is a Railway instance;
self-hosting is supported.

## Backend service (`prompta-api`)

**The deployed backend is a different repo.** `sync-server/` in this tree is not what runs in
production — the live service is `iansinnott/prompta-api` (private), checked out locally at
`~/dev/prompta-api`. Don't edit `sync-server/` expecting production to change.

| | |
| --- | --- |
| Repo | `github.com/iansinnott/prompta-api` (private), branch `master` |
| Local | `~/dev/prompta-api` |
| Host | Railway, project + service both named `prompta-api`, env `production` |
| URL | `https://api.prompta.dev` (also `prompta-production.up.railway.app`) |
| Deployed | commit `878eb97` "update model list" |
| Build | Dockerfile → `pnpm install && pnpm run build` (tsc), run `node ./dist/server.js` |
| Stack | Fastify 4, `better-sqlite3`, `@vlcn.io/crsqlite`, `openai`, PostHog |

**It does two unrelated jobs**, which is easy to miss:

1. **Sync server** — `POST /changes/:room`, `GET /changes/:room`, `POST /schema`, `GET /health`.
   `/health` returns `{"status":"ok","n":47}`, which is exactly the handshake `src/lib/sync/vlcn.ts`
   checks for.
2. **LLM proxy** — an OpenAI-compatible surface registered under `{ prefix: "/v1" }`:
   `GET /v1/models` and `POST /v1/chat/completions`, backed by **OpenRouter**
   (`OPENROUTER_API_KEY`). This *used to be* the "Prompta" provider in `defaultProviders`.
   Model IDs are rewritten `openrouter/foo` → `prompta/foo` via `modelMapping`, and gated by a
   hardcoded `modelWhitelist` in `server/server.ts`.

That second job is why `chat.prompta.dev` broke for the public: the proxy spends the *operator's*
OpenRouter credit, and that was turned off. Sync still works.

**The client no longer uses the proxy at all.** The fix was client-side auth: the "Prompta" provider
was removed and replaced by OpenRouter OAuth, so each user brings their own key. `/v1/*` on the
server is now dead weight as far as this repo is concerned. Note the proxy still answers
`GET /v1/models` with `200` and a whitelist, but `POST /v1/chat/completions` returns HTTP `200`
carrying `{"error":{"message":"User not found.","code":401}}` — the upstream key is gone, not merely
out of credit.

Railway itself is currently costing nothing, so the service stays up.

### The volume

Persistent SQLite lives on a Railway volume. `server/DBWrapper.ts:6` resolves it:

```ts
const DB_FOLDER = process.env.RAILWAY_VOLUME_MOUNT_PATH || "./dbs";
```

So locally it's `./dbs`; in production `RAILWAY_VOLUME_MOUNT_PATH` is `/app/dbs`.

| | |
| --- | --- |
| Volume | `plate-volume` (`97fc9c6d-6432-4d84-8b65-731435084004`) |
| Mount | `/app/dbs` |
| Contents | **472 files / 202 MB** — one SQLite DB per sync room, named `<uuid>.0002_schema.<hash>.sql.db`, plus `-wal`/`-shm` siblings and a `schemas/` dir |
| Backup | `homeserver:~/backups/railway-prompta/prompta-dbs-backup.tar.gz` (2026-08-03, sha256-verified) |

Note the DB filenames encode the schema file name — that's the same schema-name-is-part-of-the-sync-
handshake constraint described under "Database" above, which is why old schema files must never be
edited in place.

### Accessing the volume

Requires `railway login` (browser OAuth). A dashboard **account token does not work with the CLI** —
if `RAILWAY_TOKEN` is set in your environment the CLI will pick it up and fail with `Unauthorized`;
unset it. `railway ssh` additionally needs a key registered from **ssh-agent**
(`railway ssh keys add` — passing `--key path/to/key.pub` fails), and `ssh.railway.com` in
`known_hosts`.

```bash
P="-p 694e50fd-ce2f-492b-9b5c-3c60bf73f02d -e production -s prompta-api"

# poke around
railway ssh $P "ls -la /app/dbs; df -h /app/dbs"

# pull a single file — byte-exact, no size limit
railway volume $P files -v plate-volume download /<name>.db ./local.db --overwrite
```

⚠️ **`railway ssh` truncates output at ~350 KB of base64 (~262 KB binary), silently.** No error, just
a short file. Do not pipe `tar` through it for anything non-trivial.

To pull the whole volume, stage a tarball onto the volume and fetch it as a single file
(`files download` cannot take a directory — `/` fails with "could not infer a local filename"):

```bash
railway ssh $P "tar czf /tmp/x.tar.gz -C /app dbs && cp /tmp/x.tar.gz /app/dbs/_bk.tar.gz && sha256sum /app/dbs/_bk.tar.gz"
railway volume $P files -v plate-volume download /_bk.tar.gz ./dbs.tar.gz --overwrite
railway ssh $P "rm -f /app/dbs/_bk.tar.gz /tmp/x.tar.gz"   # clean up after
```

Verify against the checksum printed in step one, then remove the staged copy — it sits inside the
live volume until you do.

## Known rough edges

Documented so you don't mistake them for bugs you introduced — and so you know what's fragile:

- **Provider config is split three ways.** The deprecated `openAiConfig` localStorage blob (kept for
  backwards compat with existing users), per-provider `localStorage` keys for the built-in
  providers, and the `llm_provider` table for user-added ones. `llmProviders.invalidate()` merges
  the last two on every read. The source comments call this out as a design regret.
- **`currentChatThread.cancel()` is broken.** The store's `abortController` is declared but never
  assigned; `createChatCompletion` creates its own local one. Calling `cancel()` throws.
- **`sendMessage` and `promptGpt` duplicate** context-building and title-generation error handling.
- **Image attachments are stored as a JSON string** in `message.content`, detected downstream by
  `content.startsWith("[{")`. Fragile, and the sniff is repeated in several places.
- `gptProfileStore` / `profilesStore` is a multi-profile feature that was never finished, but is
  load-bearing for the current model + system message.
- **A 200 response is not a working provider.** OpenRouter's `/models` returns the full catalog even
  with an invalid key, so the app looks configured while every completion 401s. The same is true of
  `verifyOpenAICompatibileProvider`, which only pings `/models` — it cannot validate a key.
- **A stream that yields zero chunks is silently treated as success.** `createChatCompletion` saves
  the empty pending message and shows no error; some OpenAI-compatible proxies return `200` with an
  error body or an empty stream. This is how the dead Prompta backend presented: an empty assistant
  bubble and no toast. A real HTTP error status is handled correctly.
- **`LLMProviderForm` field state is subtle.** The editable fields resync only when the `provider`
  object identity changes (see the AIDEV-NOTE there). A plain one-time destructure goes stale and
  can wipe a stored key; a plain `$:` destructure clobbers whatever the user is typing.

## Conventions

- Anchor comments: `AIDEV-NOTE:`, `AIDEV-TODO:`, `AIDEV-QUESTION:`. Grep for `AIDEV-` before
  scanning files — add them for anything complex, important, or bug-prone.
- The codebase uses `console.debug`/`console.log` liberally, often with `%c` CSS styling for
  categories. Match that when adding logging.
- Tests are Playwright end-to-end only (`tests/`), and several require live API credentials
  (`TEST_OPENAI_API_KEY`). There is no meaningful unit test suite; `src/index.test.ts` is a stub.
