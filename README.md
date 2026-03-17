# Bingooo

Real-time multiplayer bingo built with Next.js, Express, and Socket.IO.

## Live demo

https://bingooo-2z8k.onrender.com

## Requirements

- Node.js `>=20.9.0 <23`
- npm

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy `.env.example` to `.env.local` or `.env` if you want to override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Host interface for the custom server |
| `PORT` | `3000` | HTTP and Socket.IO port |
| `DRAW_INTERVAL_MS` | `5000` | Delay between automatic number draws |
| `DISCONNECT_GRACE_MS` | `15000` | Reconnect grace window before removing a player |

## Deploy on Render

Deploy this app as a `Web Service`.

- Runtime: `Node`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health check path: `/health`

Render will inject `PORT` automatically. Do not hard-code it in Render.

If you use Render Blueprints, the included `render.yaml` is ready to use.

## Notes

- State is stored in memory only. Restarting the service clears rooms and games.
- This app uses a custom Node server, so deploy it as a server process, not a static site.
- Render provides HTTPS automatically. If you add a custom domain, attach it in the Render dashboard and keep HTTPS enabled.
