# DayQuest

A gamified daily planner that you can add to an iPhone Home Screen. Live at [https://tprosser87-web.github.io/dayquest/](https://tprosser87-web.github.io/dayquest/).

On an iPhone, open that link in Safari, tap Share, then Add to Home Screen.

Planner data stays in the browser on this device. Use Settings to export a backup.

## Calendar sync

Google and Outlook calendar feeds cannot be fetched directly from the browser, so sync needs a small Cloudflare Worker (`cloudflare-worker.js`). Until a worker URL is set, the Time Box tab shows "Calendar sync coming soon."

After the worker is deployed, paste its URL (for example `https://dayquest-ics.your-account.workers.dev`) into **Settings > Cloudflare Worker URL**, or set `PROXY_BASE` in `config.js` and republish this repo. Then paste each calendar's secret ICS address in Settings.

## Deploy the calendar worker

You need a free Cloudflare account.

```bash
npx wrangler login
npx wrangler deploy
```

Run those from this repo (it includes `wrangler.toml`). After login, follow the browser prompt, then deploy. Wrangler prints the worker URL. Paste that URL into the app as described above.

## GitHub Pages

This site is served from the `main` branch root, under the `/dayquest/` path.
