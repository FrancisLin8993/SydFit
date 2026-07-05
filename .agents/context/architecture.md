# SydFit Architecture

## Project Type, Language & Framework
- Name: SydFit (package name: Sydfit)
- Version: 1.0.0
- Description: "Serverless Sydney personal assistant"
- Language: TypeScript (ESM — `"type": "module"`, `module: NodeNext`), compiled with `tsc` to `dist/`
- Runtime: Node.js 24+ (Node 24-alpine in Docker, Node 24 in CI)
- Web Framework: Hono v4 (via @hono/node-server)
- Agent Framework: OpenAI Agents SDK (`@openai/agents`) — multi-agent workflow with handoffs and zod-schema tools
- Infrastructure: Google Cloud Run (serverless container) + Google Cloud Tasks (async background processing)
- CI/CD: GitHub Actions (`.github/workflows/deploy.yml`, auto-deploys to Cloud Run on push to main)
- Linting/Formatting: Biome v2.5 (recommended rules, tab indentation, double quotes)
- Testing: `node --loader ts-node/esm --experimental-test-module-mocks --test` (node:test + `mock.module()`; ts-node in transpile-only mode via tsconfig `ts-node.transpileOnly`)
- Purpose: Daily morning briefing (weather-based clothing advice + relevant Sydney transit alerts) pushed to iPhone via Bark, plus on-demand queries routed through a triage agent.

## Agent Architecture

Three agents built on the OpenAI Agents SDK. All agent instructions are hosted in
**Langfuse prompt management** (prompts: `triage-agent`, `traffic-advice`,
`weather-advice`; fetched at startup from the `production` label via
`getPromptInstructions()` in `src/services/langfuse.ts`, which falls back to short
in-code generic instructions on any fetch failure rather than crashing the server).
When code changes rename tools, the Langfuse-hosted prompts must be updated manually.

- **sydfit-triage** (`src/agents/triageAgent.ts`)
  - Routes each incoming message: memory-save intent vs traffic vs weather.
  - Tools: `save_preference` (freeform preferences), `save_transit_lines`
    (structured transit-line preference, zod-constrained to canonical line codes).
  - Handoffs: `sydney-traffic-agent`, `sydney-weather-agent`.
- **sydney-traffic-agent** (`src/agents/trafficAgent.ts`)
  - Single merged tool `get_transit_disruptions` (`src/tools/tfnswTool.ts`): looks up
    the user's preferred lines from memory AND fetches TfNSW alerts concurrently
    (`Promise.all`), then filters alerts to those lines in code (word-boundary
    matching, `src/utils/transitLines.ts`). The model only ever sees already-relevant
    alerts — deliberate design to avoid the model round-tripping large alert payloads.
  - `modelSettings.toolChoice: "required"` — forces the tool call before answering
    (guards against the model answering vague inputs like "Alert" from guesswork).
- **sydney-weather-agent** (`src/agents/weatherAgent.ts`)
  - Tools: `get_user_location_memory` (saved location, default Mascot NSW),
    `get_weather` (Open-Meteo geocoding + forecast). Also `toolChoice: "required"`.

Output style: push notifications render Markdown in Bark — traffic uses bold line
names + bullets per disruption (with time windows); weather bolds the single most
actionable advice phrase.

## Memory (Mem0 Platform)

- Managed Mem0 Platform via the `mem0ai` SDK (`src/services/memoryService.ts`);
  hardcoded single user `user_id: "francis"`. The former self-hosted
  `sydfit-mem0` Cloud Run service (mem0 OSS + Qdrant) is decommissioned.
- Transit-line preferences are stored with structured metadata
  `{type: "transit_lines", lines: ["T8", ...]}` so retrieval is exact, not
  prose-parsing. Freeform preferences coexist without metadata.
- Platform `add()` is **asynchronous** (queued extraction, returns PENDING) —
  accepted eventual consistency, no polling.
- An in-process LRU cache (`lru-cache`, max 100, 30-min TTL) fronts `search()`,
  keyed by query text; **cleared on every successful write**. TTL is a staleness
  safety net only. Note the SDK's shipped types are partly wrong: `search()`
  returns snake_case fields at runtime (see `RawMem0SearchResult` comment).

## External Services

- **TfNSW Open Data** (`src/services/tfnsw.ts`): direct GET to
  `https://api.transport.nsw.gov.au/v2/gtfs/alerts/{mode}?format=json` with
  `Authorization: apikey` — JSON, no protobuf. Maps GTFS-RT entities (defensive
  camelCase/snake_case fallbacks) to `{title, description, activePeriods, cause,
  effect, url}`. The former `mcp-tfnsw` intermediary Cloud Run service is
  decommissioned (it was never actually MCP-protocol).
- **Open-Meteo** (`src/tools/weatherTool.ts`): geocoding + 1-day forecast, keyless.
- **Bark** (`src/services/bark.ts`): push notifications, body sent as `markdown`.
- **Langfuse** (`src/services/langfuse.ts`): OTel-based tracing (enabled only when
  keys present) + prompt management + `flushLangfuse()` before responses.
- **Google Cloud Tasks** (`src/services/googleCloudTask.ts`): enqueues
  `/api/ask` payloads to `/api/process-task` with the API key header passed through.
- **OpenAI** via `openai` + `headroom-ai` wrapper (`src/services/openaiClient.ts`);
  default model `gpt-5.4-mini` (`OPENAI_MODEL` to override).

## HTTP Endpoints (src/index.ts)

Auth middleware: `x-sydfit-token` header must equal `SYDFIT_API_KEY`
(`/swagger` and `/doc` whitelisted).

- `POST /api/ask` — enqueue query to Cloud Tasks, 202.
- `POST /api/process-task` — run triage agent on queued query; Bark push titled by
  which agent handled it (traffic/weather/memory).
- `POST /api/cron` — morning briefing: weather + traffic agents run concurrently
  (`Promise.allSettled` — one failure doesn't cancel the other), two Bark pushes.
- `GET /doc`, `GET /swagger` — OpenAPI JSON + Swagger UI.

## Directory Structure

/Users/fengcilin/Documents/personal-assistant/SydFit/
  .agents/                   # Agent context (this file) + Langfuse skill
  .github/workflows/deploy.yml  # Build → Artifact Registry → Cloud Run
  .env / .env.example        # Env vars (see README for the full list)
  biome.json, tsconfig.json, Dockerfile, package.json
  src/
    index.ts                 # Hono app, auth middleware, routes
    agents/
      triageAgent.ts         # sydfit-triage (tools + handoffs)
      trafficAgent.ts        # sydney-traffic-agent
      weatherAgent.ts        # sydney-weather-agent
    tools/
      tfnswTool.ts           # get_transit_disruptions (merged lines+alerts+filter)
      transitLinesMemory.ts  # getUserTransitLines() plain helper (not a tool)
      saveTransitLinesTool.ts    # save_transit_lines (structured metadata)
      saveUserPreferenceTool.ts  # save_preference (freeform)
      locationMemoryTool.ts  # get_user_location_memory
      memoryTool.ts          # get_user_memory (generic; currently unused by agents)
      weatherTool.ts         # get_weather (Open-Meteo)
    services/
      memoryService.ts       # Mem0 Platform client + LRU search cache
      tfnsw.ts               # Direct TfNSW alerts client
      bark.ts                # Push notifications
      googleCloudTask.ts     # Cloud Tasks enqueuer
      langfuse.ts            # Tracing + prompt fetching (with fallback)
      openaiClient.ts        # OpenAI + headroom client
    utils/
      config.ts              # loadConfig()/loadConfigFromEnv()
      logger.ts              # GCP-structured JSON writeLog()
      transitLines.ts        # Canonical lines (T1–T6, T8, T9, AIRPORT, LIGHTRAIL,
                             #   METRO), alias map, normalizeLine(), alertMentionsLine()
      weatherCodes.ts        # WMO code → description
  test/                      # 1:1 node:test suites for the above (mock.module-based;
                             #   agent factory tests mock @openai/agents' Agent class)

## Conventions & Gotchas

- Relative imports use `.js` specifiers (TS NodeNext); tests run through ts-node/esm.
- Tool factories take `config` in closure: `export const xTool = (config) => tool({...})`.
- `@openai/agents` `tool().invoke()` swallows execute() errors via a default error
  function — tests assert on the resolved error string, not rejections.
- node:test `mockImplementationOnce()` without an explicit `onCall` index silently
  overwrites (not stacks) a previously queued one-shot — pass indices when queuing two.
- Agent modules fetch prompts via top-level await at import time.
- `matched_preferences` in tool output = which preferred lines actually had alert
  hits (canonical uppercase codes).

## Decommissioned (do not reference)

- `sydfit-mem0` service (mem0 OSS + Qdrant on Cloud Run) → Mem0 Platform.
- `mcp-tfnsw` service → direct TfNSW API calls.
- `src/services/gcpAuth.ts` + `google-auth-library` (only consumer was the MCP call).
- `filterAlertsTool` / `get_relevant_tfnsw_alerts` / `get_user_transit_lines` as
  separate agent tools → merged into `get_transit_disruptions`.
- `intentRouter` (manual intent classification) → triage agent.
