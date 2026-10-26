# Running Darb Scouter on the Mac

Everything runs in Docker Compose: Postgres, Elasticsearch, the API (which also serves the app) and the scheduler.
Nothing is exposed to the internet. The phone reaches the app over Tailscale.

## 1. First start

1. Install Docker Desktop and turn on **Start Docker Desktop when you sign in** (Settings → General).
2. Copy the env file and fill it in:
   ```sh
   cp .env.example .env
   ```
   | Variable | What to put |
   |---|---|
   | `ANTHROPIC_API_KEY` | Your Anthropic API key. Needed to read job posts. |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | See step 3. Leave empty to turn alerts off. |
   | `PUBLIC_APP_URL` | The Tailscale URL from step 4, used in alert links. |
   | `SCOUTER_TOKEN` | Any long random string: `openssl rand -hex 24`. |
   `DATABASE_URL` and `ELASTIC_URL` are set by Compose; leave the example values.
3. Start it:
   ```sh
   docker compose up -d --build
   scripts/smoke.sh        # checks the API and the app answer
   ```
   The first scan runs as soon as the scheduler sees it's due. Run one by hand any time:
   ```sh
   curl -X POST -H "X-Scouter-Token: $SCOUTER_TOKEN" localhost:8000/api/runs
   ```

## 2. The daily scan

The scheduler scans at 07:00 Israel time (`SCAN_HOUR`, `TIMEZONE`). If the Mac was asleep at 07:00, the scan runs
within 10 minutes of waking, exactly once. A Postgres lock stops two runs from overlapping. Every run's summary,
including any source that failed, shows on the Radar screen and in the Telegram summary.

```sh
docker compose logs -f scheduler     # watch a scan
```

## 3. Telegram alerts

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<token>/getUpdates` and copy `message.chat.id` into `TELEGRAM_CHAT_ID`.
3. `docker compose up -d` to restart with the new values.

You get one message per new job scoring over 9,000, then a one-line morning summary.

## 4. Phone access over Tailscale

1. Install Tailscale on the Mac and the phone, signed in to the same account.
2. On the Mac: `tailscale serve --bg 8000`. It prints an `https://<mac>.<tailnet>.ts.net` URL. Put it in `PUBLIC_APP_URL`.
3. Open that URL on the phone and enter `SCOUTER_TOKEN` once in Settings.

Use `serve`, never `funnel`: serve is reachable only from your own devices.

## 5. Backups and updates

```sh
docker compose exec db pg_dump -U postgres postgres > backup-$(date +%F).sql   # back up
git pull && docker compose up -d --build                                        # update
```

## When something looks wrong

| Symptom | Check |
|---|---|
| Radar says a source failed | `docker compose logs scheduler`, then search the error. A page format change needs a parser fix. |
| "waiting to be read" in the summary | The Anthropic API was unreachable; those jobs retry on the next run. |
| No Telegram messages | Both Telegram variables set? `alertsFailed` in `GET /api/runs/latest`? |
| Search ignores Hebrew | `docker compose logs api`: the embedding model downloads on first use (about 500 MB, cached in the `models` volume). |
