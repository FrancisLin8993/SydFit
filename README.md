# SydFit

SydFit is a serverless personal assistant designed for Sydney residents. It fetches local weather data, leverages transit preferences stored as structured long-term memory, and uses an OpenAI Agents SDK multi-agent workflow to deliver concise, actionable morning briefings (clothing recommendations and public transport alerts) via push notifications.

## Core Features

* **Morning Briefing**: Automatically delivers a weather-based clothing recommendation and relevant Sydney transport alerts at 7:00 AM AEST/AEDT.
* **Multi-Agent Workflow**: A triage agent (built on the [OpenAI Agents SDK](https://github.com/openai/openai-agents-js)) routes each request — saving preferences and answering traffic queries via tools, or handing off to the weather specialist agent.
* **Memory Persistence**: Stores user preferences in the managed [Mem0 Platform](https://mem0.ai). Transit-line preferences are saved as structured metadata (canonical line codes like `T8`, `AIRPORT`), so alert filtering is exact matching rather than text guessing. An in-process LRU cache (30-min TTL, invalidated on writes) sits in front of memory searches.
* **Direct TfNSW Integration**: Real-time transit alerts fetched straight from the TfNSW Open Data API and filtered to the user's preferred lines in code — the model only ever sees relevant alerts.
* **Structured Logging**: GCP-compatible JSON logging for observability in production.
* **Push Notifications**: Markdown-formatted messages (bold line names, bullet lists) delivered to iPhone via [Bark](https://bark.day.app).

## Architecture

* **Language/Runtime**: TypeScript on Node.js 24+ (ESM), compiled with `tsc`.
* **Infrastructure**: Google Cloud Run (deployed via GitHub Actions on push to `main`); Google Cloud Tasks for async background processing of `/api/ask` requests.
* **Agents** (instructions live in version-controlled markdown files under `src/prompts/`):
  * `sydfit-triage` — routes intent; tools: `save_preference`, `save_transit_lines`, and `get_transit_disruptions` (looks up preferred lines and fetches + filters TfNSW alerts concurrently, in code — triage writes the traffic briefing itself); hands off to the weather specialist.
  * `sydney-traffic-agent` — same `get_transit_disruptions` tool; used directly by the `/api/cron` morning briefing.
  * `sydney-weather-agent` — `get_user_location_memory` + `get_weather` (Open-Meteo, geocoded location with Mascot, NSW as default).
* **External APIs**:
  * **OpenAI**: Powers all agents (default model `gpt-5.4-mini`, configurable via `OPENAI_MODEL`).
  * **Open-Meteo**: Weather data (geocoding + forecast, no API key required).
  * **TfNSW Open Data**: GTFS-realtime alerts v2, fetched as JSON directly.
  * **Mem0 Platform**: Managed long-term memory.
  * **Langfuse**: LLM tracing (prompts are local files, not Langfuse-hosted).

## Endpoints

All endpoints require the `x-sydfit-token` header (except `/doc` and `/swagger`).

* `POST /api/ask` — accepts a query, enqueues it to Cloud Tasks for background processing (returns 202).
* `POST /api/process-task` — processes a queued query through the triage agent and pushes the result via Bark.
* `POST /api/cron` — the morning briefing: runs the weather and traffic agents concurrently and sends both notifications (triggered by Cloud Scheduler).
* `GET /swagger` / `GET /doc` — API documentation.

## Setup

1. **Environment Variables**: Copy `.env.example` to `.env` and configure the following:
   * `OPENAI_API_KEY`: API key for OpenAI.
   * `BARK_DEVICE_KEY`: Key from the Bark iOS app.
   * `SYDFIT_API_KEY`: A custom API key to secure your SydFit endpoints.
   * `MEM0_API_KEY`: API key for the [Mem0 Platform](https://app.mem0.ai) (managed).
   * `TFNSW_API_KEY`: API key for the [TfNSW Open Data](https://opendata.transport.nsw.gov.au) realtime alerts API.
   * `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_QUEUE_NAME`, `SYDFIT_SERVICE_URL`: Google Cloud Tasks configuration for async processing.
   * `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`: Langfuse credentials for LLM tracing (optional — tracing is disabled when keys are absent).

2. **Dependencies**:
   ```bash
   npm install
   ```

3. **Running the Service**:
   * Develop locally: `npm run dev`
   * Build: `npm run build`, then start: `npm start`
   * Run unit tests: `npm test`

## Configuration

* **Models**: Defaults to `gpt-5.4-mini` (configurable via `OPENAI_MODEL`).
* **Bark**: Defaults to `https://api.day.app`, but supports self-hosted instances via `BARK_SERVER_URL`.
* **Weather location**: Resolved from the user's saved location preference (geocoded via Open-Meteo); falls back to Mascot, NSW.
* **Transit lines**: Canonical line codes (T1–T6, T8, T9, AIRPORT, LIGHTRAIL, METRO) with alias normalization live in `src/utils/transitLines.ts`.

## Logging

SydFit uses a structured logging utility (`src/utils/logger.ts`) that outputs JSON logs compatible with Google Cloud Logging. All logs contain a `severity`, `timestamp`, and relevant metadata, facilitating filtering and alerting in the Google Cloud operations console.

## Prompts

Agent instructions are version-controlled markdown files in `src/prompts/` (`triage-agent.md`, `traffic-advice.md`, `weather-advice.md`), loaded synchronously at startup — no network fetch, no drift between code and prompts (a prompt change and the tool rename it references land in the same commit). `test/prompts.test.ts` guards this: it asserts each prompt references its agent's real tool names. The build step copies the `.md` files into `dist/`.

## Tracing (Langfuse)

SydFit integrates [Langfuse](https://langfuse.com) for LLM observability. Each request (`/api/process-task`, `/api/cron`) is a trace with tags (`ask`, `cron`); agent runs, handoffs, and tool calls appear as nested spans with token usage and latencies. Traces are flushed before each response for reliable delivery in serverless environments.

**Setup:**

1. Create a free [Langfuse Cloud](https://cloud.langfuse.com) account (or self-host).
2. Copy your API keys from **Settings → API Keys** into `.env` (see above).
3. Tracing activates automatically when the keys are present. When absent, the app runs normally with no tracing overhead.
