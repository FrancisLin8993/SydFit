## Project Type, Language & Framework
- Name: SydFit (package name: Sydfit)
- Version: 1.0.0
- Description: "Serverless Sydney personal assistant"
- Language: JavaScript (ESM -- "type": "module")
- Runtime: Node.js 24+ (uses Node 24-alpine in Docker, Node 24 in CI)
- Web Framework: Hono (https://hono.dev) v4.12 (lightweight, Edge-compatible HTTP framework), served via @hono/node-server v2.0
- Infrastructure: Google Cloud Run (serverless container), Docker-based deployment
- CI/CD: GitHub Actions (auto-deploys to Cloud Run on push to main)
- Linting/Formatting: Biome (https://biomejs.dev) v2.5.1 (with recommended rules, tab indentation, double quotes)
- Package Manager: npm
- Purpose: Delivers a daily morning briefing to an iPhone via Bark (https://bark.day.app) push notifications, combining Sydney weather data (from Open-Meteo) and real-time transit alerts (from Transport for NSW via an MCP server), with LLM-powered intent routing and clothing recommendations via OpenAI.

## Full Directory Structure

### Top-Level

/Users/fengcilin/Documents/SydFit/
  .agents/                   # Agent skill definitions (Langfuse skill)
  .env                       # Local environment variables (gitignored)
  .env.example               # Example environment variables template
  .git/                      # Git metadata
  .github/                   # GitHub Actions workflows
  .gitignore                 # Git ignore rules
  biome.json                 # Biome linter/formatter config
  Dockerfile                 # Docker image definition (Node 24-alpine)
  node_modules/              # Installed dependencies
  package-lock.json          # Dependency lock file
  package.json               # NPM package manifest
  README.md                  # Project documentation
  skills-lock.json           # Lock file for .agents skills
  src/                       # Application source code (13 files)
  test/                      # Unit tests (9 files)

## src/ -- Application Source Code

/Users/fengcilin/Documents/SydFit/src/
  index.js             # Main entry point: Hono app, routes (POST /api/ask, /api/process-task, /api/cron)
  config.js            # Configuration loader (reads env vars with defaults)
  logger.js            # Structured JSON logger (GCP-compatible)
  index.js             # (duplicate listing due to alphabetical sort)
  bark.js              # Push notification sender via Bark API
  googleCloudTask.js   # Google Cloud Tasks enqueuer (for async background processing)
  intentRouter.js      # LLM-powered intent router (weather / traffic / memory) using OpenAI + Headroom AI + Langfuse
  weatherAgent.js      # Weather fetcher (Open-Meteo) + clothing recommendation (OpenAI)
  weatherCodes.js      # WMO weather code to human-readable description mapping
  trafficAgent.js      # TfNSW transit alerts via MCP server + AI filtering
  memoryService.js     # Mem0/Qdrant-based user preference memory (CRUD operations)
  openaiClient.js      # Shared OpenAI client instance (with Headroom AI middleware)
  langfuse.js          # Langfuse tracing/observability setup (OpenTelemetry-based)
  gcpAuth.js           # Google Cloud Auth (ID token generation for service-to-service calls)
test/ -- Unit Tests
/Users/fengcilin/Documents/SydFit/test/
  bark.test.js
  config.test.js
  googleCloudTask.test.js
  index.test.js
  intentRouter.test.js
  openaiClient.test.js
  trafficAgent.test.js
  weatherAgent.test.js
  weatherCodes.test.js
.github/workflows/ -- CI/CD
/Users/fengcilin/Documents/SydFit/.github/workflows/
  deploy.yml           # Deploy to Google Cloud Run (push to main)
.agents/ -- Agent Skills
/Users/fengcilin/Documents/SydFit/.agents/skills/
  langfuse/
    SKILL.md
    references/
      ci-cd.md
      cli.md
      error-analysis.md
      instrumentation.md
      judge-calibration.md
      prompt-migration.md
      sdk-upgrade.md
      skill-feedback.md
      user-feedback.md