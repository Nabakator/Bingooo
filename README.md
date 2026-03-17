# Bingooo

Real-time multiplayer bingo built with Next.js, a custom Express server, and Socket.IO.

## Requirements

- Node.js `>=20.9.0`
- npm

## Stack

- Next.js App Router
- TypeScript
- Custom Node server with Express
- Socket.IO for real-time multiplayer
- In-memory room and game state

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open:

   ```text
   http://localhost:3000
   ```

## Scripts

- `npm run dev` starts the custom server in development mode
- `npm run build` builds the Next.js app
- `npm run start` starts the custom server in production mode
- `npm run typecheck` runs TypeScript without emitting files

## Environment variables

Copy `.env.example` to `.env.local` or `.env` if you want to override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Host interface for the custom server |
| `PORT` | `3000` | Port for HTTP and Socket.IO |
| `DRAW_INTERVAL_MS` | `5000` | Time between automatic number draws |
| `DISCONNECT_GRACE_MS` | `15000` | Reconnect grace window before a player is removed |

## Deploying on Render

- Service type: `Web Service`
- Runtime: `Node`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health check path: `/health`
- Node version: pinned in `.node-version` and `render.yaml`

If you use Render Blueprints, the included `render.yaml` is enough to create the service.

## Notes

- The server is authoritative for rooms, cards, draws, and bingo validation.
- Room and game state are stored in memory only.
- Restarting the server clears all active rooms and games.
- This project uses a custom Node server and is not serverless-ready.
