# Sniper Live Dashboard

Simplistic real-time live web dashboard for username snipers.

## Features
- Real-time live candidate stream (Server-Sent Events / fast polling)
- Available claimable usernames showcase with one-click copy
- Synthetic audio chime alert on available hits
- Zero rate limits, bypassing Discord message rate limits
- Platform filter and stream pause/clear controls
- Vercel 1-click serverless deployment

## Deploying to Vercel
1. Push this repository to your GitHub account (or import into Vercel).
2. On Vercel, click **Add New** > **Project** and select this repo.
3. Click **Deploy**.
4. Copy your live Vercel URL (e.g. `https://your-sniper-live.vercel.app`).

## Connecting to Discord Bot
In your Discord bot's `.env` configuration file on Apollo Panel:
```env
DASHBOARD_WEBHOOK_URL=https://your-sniper-live.vercel.app/api/events
```
Restart your bot. All candidate checks and available hits will stream to your website in real time.
