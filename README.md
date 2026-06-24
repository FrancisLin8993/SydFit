# SydFit

SydFit is a serverless personal assistant designed for Sydney residents. It fetches local weather data, leverages historical transit preferences stored in a vector database, and utilizes OpenAI's models to provide concise, actionable morning briefings (clothing recommendations and public transport alerts) via push notifications.

## Core Features

* **Morning Briefing**: Automatically delivers a weather-based clothing recommendation and relevant Sydney transport alerts at 7:00 AM AEST/AEDT.
* **AI-Powered Routing**: Uses an intent router to classify user requests between "weather", "traffic" (transit) and "memory" modes.
* **Memory Persistence**: Maintains historical user transit preferences using [Mem0](https://mem0.ai) and [Qdrant](https://qdrant.tech) to provide personalized travel advice.
* **Structured Logging**: Implements GCP-compatible structured logging for improved observability and debugging in production.
* **Push Notifications**: Delivers content to iPhone via [Bark](https://bark.day.app).

## Architecture

* **Runtime**: Node.js 24+
* **Infrastructure**: Hosted on Google Cloud Run.
* **External APIs**:
* **OpenAI**: Used for clothing recommendations and intent classification.
* **Open-Meteo**: Provides local weather data for Mascot, NSW.
* **Transport for NSW (TfNSW)**: Accessed via a dedicated MCP (Model Context Protocol) server for real-time transit alerts.



## Setup

1. **Environment Variables**: Copy `.env.example` to `.env` and configure the following:
* `OPENAI_API_KEY`: API key for OpenAI.
* `BARK_DEVICE_KEY`: Key from the Bark iOS app.
* `SYDFIT_API_KEY`: A custom API key to secure your SydFit endpoints.
* `MEM0_API_URL` & `MEM0_ACCESS_TOKEN`: Configuration for your Mem0 memory service.
* `MCP_SERVER_URL` & `MCP_ACCESS_TOKEN`: Connection details for the TfNSW MCP server.


2. **Dependencies**: Install required packages:
```bash
npm install

```


3. **Running the Service**:
* Start the service locally: `npm start`
* Run unit tests: `npm test`


```

## Configuration

* **Models**: Defaults to `gpt-4o-mini` (or configurable via `OPENAI_MODEL`).
* **Bark**: Defaults to `https://api.day.app`, but supports self-hosted instances via `BARK_SERVER_URL`.
* **Weather**: Coordinates are fixed to Mascot, NSW; no external API key is required.

## Logging

SydFit uses a structured logging utility (`logger.js`) that outputs JSON logs compatible with Google Cloud Logging. This ensures all logs contain a `severity`, `timestamp`, and relevant metadata, facilitating easier filtering and alerting within the Google Cloud operations console.