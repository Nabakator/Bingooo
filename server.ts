import http from "node:http";

import express from "express";
import next from "next";
import { Server, type Socket } from "socket.io";

import {
  checkBingo,
  createShuffledNumbers,
  drawNextNumber,
  generateCard,
} from "./lib/bingo";
import type {
  BingoResultPayload,
  ClientToServerEvents,
  CreateRoomPayload,
  JoinRoomPayload,
  Player,
  RoomState,
  ServerToClientEvents,
} from "./types/socket";

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const parsedIntervalMs = Number(process.env.DRAW_INTERVAL_MS ?? 5000);
const DRAW_INTERVAL_MS = Number.isFinite(parsedIntervalMs) ? parsedIntervalMs : 5000;

type RoomRecord = {
  state: RoomState;
  remainingNumbers: number[];
  drawTimer: ReturnType<typeof setInterval> | null;
};

const rooms = new Map<string, RoomRecord>();
const socketToRoom = new Map<string, string>();
let roomCount = 0;
let playerCount = 0;

function nextRoomId() {
  return (++roomCount).toString(36).toUpperCase().padStart(4, "0");
}

function trimName(name: string) {
  return name.trim();
}

function createPlayer(socketId: string, name: string): Player {
  return {
    playerId: `player-${++playerCount}`,
    name,
    socketId,
    card: generateCard(),
  };
}

function stopRoomTimer(room: RoomRecord) {
  if (!room.drawTimer) return;
  clearInterval(room.drawTimer);
  room.drawTimer = null;
}

function emitRoomState(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
) {
  const room = rooms.get(roomId);
  if (room) io.to(roomId).emit("room_state", room.state);
}

function getRoomForSocket(socketId: string) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;
  return { roomId, room: rooms.get(roomId) ?? null };
}

function emitBingoResult(
  target: {
    emit: (event: "bingo_result", payload: BingoResultPayload) => void;
  },
  payload: BingoResultPayload,
) {
  target.emit("bingo_result", payload);
}

function tickRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
) {
  const room = rooms.get(roomId);
  if (!room || room.state.gameStatus !== "running") return;

  const nextDraw = drawNextNumber(room.remainingNumbers, room.state.calledNumbers);

  if (nextDraw.drawnNumber === null) {
    room.state.gameStatus = "finished";
    stopRoomTimer(room);
    emitRoomState(io, roomId);
    return;
  }

  room.remainingNumbers = nextDraw.remainingNumbers;
  room.state.calledNumbers = nextDraw.calledNumbers;
  emitRoomState(io, roomId);
}

function removeFromRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  leaveSocketRoom: boolean,
) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  socketToRoom.delete(socket.id);
  if (leaveSocketRoom) socket.leave(roomId);

  const room = rooms.get(roomId);
  if (!room) return;

  room.state.players = room.state.players.filter((player) => player.socketId !== socket.id);

  if (room.state.players.length === 0) {
    stopRoomTimer(room);
    rooms.delete(roomId);
    return;
  }

  if (!room.state.players.some((player) => player.socketId === room.state.hostSocketId)) {
    room.state.hostSocketId = room.state.players[0].socketId;
  }

  emitRoomState(io, roomId);
}

function createRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: CreateRoomPayload,
) {
  const name = trimName(payload.name);
  if (!name) return socket.emit("room_error", { message: "Player name is required." });

  removeFromRoom(io, socket, true);

  const roomId = nextRoomId();
  const room: RoomRecord = {
    state: {
      roomId,
      players: [createPlayer(socket.id, name)],
      hostSocketId: socket.id,
      calledNumbers: [],
      winnerPlayerId: null,
      drawIntervalMs: DRAW_INTERVAL_MS,
      gameStatus: "waiting",
    },
    remainingNumbers: [],
    drawTimer: null,
  };

  rooms.set(roomId, room);
  socketToRoom.set(socket.id, roomId);
  socket.join(roomId);
  socket.emit("room_created", { roomId });
  emitRoomState(io, roomId);
}

function joinRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: JoinRoomPayload,
) {
  const name = trimName(payload.name);
  const roomId = payload.roomId.trim().toUpperCase();
  const room = rooms.get(roomId);
  const normalizedName = name.toLowerCase();

  if (!name) {
    return socket.emit("room_error", {
      message: "Player name is required.",
      roomId,
    });
  }
  if (!room) {
    return socket.emit("room_error", {
      message: "Room does not exist.",
      roomId,
    });
  }
  if (room.state.gameStatus !== "waiting") {
    return socket.emit("room_error", {
      message: "Cannot join a game that has already started.",
      roomId,
    });
  }
  if (
    room.state.players.some(
      (player) => player.name.toLowerCase() === normalizedName,
    )
  ) {
    return socket.emit("room_error", {
      message: "That player name is already taken in this room.",
      roomId,
    });
  }

  removeFromRoom(io, socket, true);

  room.state.players.push(createPlayer(socket.id, name));
  socketToRoom.set(socket.id, roomId);
  socket.join(roomId);
  emitRoomState(io, roomId);
}

function startGame(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  const roomMatch = getRoomForSocket(socket.id);
  if (!roomMatch || !roomMatch.room) {
    return socket.emit("room_error", { message: "You are not in a room." });
  }

  const { roomId, room } = roomMatch;
  if (room.state.hostSocketId !== socket.id) {
    return socket.emit("room_error", { message: "Only the host can start the game." });
  }
  if (room.state.gameStatus !== "waiting") {
    return socket.emit("room_error", { message: "Game can only start from waiting state." });
  }

  stopRoomTimer(room);
  room.remainingNumbers = createShuffledNumbers();
  room.state.calledNumbers = [];
  room.state.winnerPlayerId = null;
  room.state.gameStatus = "running";
  emitRoomState(io, roomId);

  room.drawTimer = setInterval(() => {
    tickRoom(io, roomId);
  }, room.state.drawIntervalMs);
}

function claimBingo(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  const roomMatch = getRoomForSocket(socket.id);
  if (!roomMatch || !roomMatch.room) {
    return socket.emit("room_error", { message: "You are not in a room." });
  }

  const { roomId, room } = roomMatch;
  const player = room.state.players.find((entry) => entry.socketId === socket.id);
  if (!player) {
    return socket.emit("room_error", { message: "Player was not found in the room." });
  }
  if (room.state.gameStatus !== "running") {
    return emitBingoResult(socket, {
      isValid: false,
      pattern: null,
      winnerPlayerId: room.state.winnerPlayerId,
      message: "Game is not running.",
    });
  }

  const result = checkBingo(player.card, room.state.calledNumbers);
  if (!result.isBingo) {
    return emitBingoResult(socket, {
      isValid: false,
      pattern: result.pattern,
      winnerPlayerId: room.state.winnerPlayerId,
      message: "Bingo claim is not valid yet.",
    });
  }

  room.state.winnerPlayerId = player.playerId;
  room.state.gameStatus = "finished";
  stopRoomTimer(room);
  emitRoomState(io, roomId);
  emitBingoResult(io.to(roomId), {
    isValid: true,
    pattern: result.pattern,
    winnerPlayerId: player.playerId,
    message: `${player.name} has bingo.`,
  });
}

async function startServer() {
  const nextApp = next({ dev, hostname: host, port });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.emit("server:ready", { socketId: socket.id });
    socket.on("create_room", (payload) => createRoom(io, socket, payload));
    socket.on("join_room", (payload) => joinRoom(io, socket, payload));
    socket.on("start_game", () => startGame(io, socket));
    socket.on("claim_bingo", () => claimBingo(io, socket));
    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
      removeFromRoom(io, socket, false);
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.all("*", (req, res) => handle(req, res));

  httpServer.listen(port, host, () => {
    console.log(`> Ready on http://${host}:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
