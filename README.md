# SydFit

Small Node.js service that checks local weather, asks the OpenAI Responses API for a clothing recommendation, and sends it to an iPhone using Bark.

## Setup

1. Install Node.js 20.6 or newer.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `OPENAI_API_KEY`
   - `BARK_DEVICE_KEY`, copied from the Bark iOS app test URL
4. Run the job. It sends only when the local time in `Australia/Sydney` is 7:00 AM:

```bash
npm start
```

To send one notification immediately:

```bash
npm run run-once
```

To run the unit tests:

```bash
npm test
```

## GitHub Actions

The project includes `.github/workflows/daily-weather.yml`.

GitHub Actions cron runs in UTC, while Sydney switches between AEST and AEDT. The workflow therefore runs at both possible UTC times:

```yaml
- cron: "0 20 * * *"
- cron: "0 21 * * *"
```

`src/index.js` checks `Australia/Sydney` and sends the notification only when the local time is exactly 7:00 AM. Manual `workflow_dispatch` runs bypass that guard so you can test the notification immediately.

Manual runs accept an optional `prompt` input. This is intended for iOS Shortcuts text such as `office day`, `gym after work`, or `formal dinner tonight`. The prompt is sent to the OpenAI model together with the weather, and the result is delivered through Bark in the same way as the scheduled notification.

For an iOS Shortcut using GitHub's workflow dispatch API, send:

```json
{
  "ref": "main",
  "inputs": {
    "prompt": "office day, gym after work"
  }
}
```

If your Shortcut uses `repository_dispatch`, send this instead:

```json
{
  "event_type": "mobile_prompt",
  "client_payload": {
    "prompt": "office day, gym after work"
  }
}
```

Add these repository secrets:

- `OPENAI_API_KEY`
- `BARK_DEVICE_KEY`

Optional repository variables:

- `OPENAI_MODEL`
- `BARK_SERVER_URL`
- `BARK_GROUP`
- `BARK_LEVEL`

## Configuration

`OPENAI_MODEL` defaults to `gpt-5.4-mini`. OpenAI's model docs list latest models as available through the Responses API, and the Responses API creates a response with `POST /v1/responses`.

`BARK_SERVER_URL` defaults to Bark's hosted service, `https://api.day.app`. For self-hosted Bark, set it to your server origin. The app sends JSON to `/push` with `device_key`, `title`, `subtitle`, and `body`.

`USER_PROMPT` is optional local context for manual runs. GitHub Actions sets it from `repository_dispatch.client_payload.prompt`.

Weather comes from Open-Meteo using Mascot coordinates, so no weather API key is required.
