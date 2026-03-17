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
  SocketAuth,
  ServerToClientEvents,
} from "./types/socket";

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const parsedIntervalMs = Number(process.env.DRAW_INTERVAL_MS ?? 5000);
const parsedGraceMs = Number(process.env.DISCONNECT_GRACE_MS ?? 15000);
const DRAW_INTERVAL_MS = Number.isFinite(parsedIntervalMs) ? parsedIntervalMs : 5000;
const DISCONNECT_GRACE_MS = Number.isFinite(parsedGraceMs) ? parsedGraceMs : 15000;
const ROOM_IDS = [
  "Alfa",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
  "Kilo",
  "Lima",
  "Mike",
  "November",
  "Oscar",
  "Papa",
  "Quebec",
  "Romeo",
  "Sierra",
  "Tango",
  "Uniform",
  "Victor",
  "Whiskey",
  "Xray",
  "Yankee",
  "Zulu",
] as const;

type RoomRecord = {
  state: RoomState;
  remainingNumbers: number[];
  drawTimer: ReturnType<typeof setInterval> | null;
  pendingRemovalTimers: Map<string, ReturnType<typeof setTimeout>>;
};

const rooms = new Map<string, RoomRecord>();
const socketToRoom = new Map<string, string>();
const socketToSession = new Map<string, string>();
const sessionToPlayer = new Map<string, { roomId: string; playerId: string }>();
let playerCount = 0;

function nextRoomId() {
  return ROOM_IDS.find((roomId) => !rooms.has(roomId)) ?? null;
}

function trimName(name: string) {
  return name.trim();
}

function getSessionId(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
  const auth = socket.handshake.auth as Partial<SocketAuth> | undefined;
  const sessionId = typeof auth?.sessionId === "string" ? auth.sessionId.trim() : "";
  return sessionId || socket.id;
}

function canCreateRoom(socketId: string) {
  const currentRoomId = socketToRoom.get(socketId);
  if (!currentRoomId) return rooms.size < ROOM_IDS.length;

  const currentRoom = rooms.get(currentRoomId);
  if (!currentRoom) return rooms.size < ROOM_IDS.length;

  return currentRoom.state.players.length === 1 || rooms.size < ROOM_IDS.length;
}

function findRoomId(roomId: string) {
  const normalizedRoomId = roomId.trim().toLowerCase();
  return ROOM_IDS.find(
    (candidate) =>
      candidate.toLowerCase() === normalizedRoomId && rooms.has(candidate),
  ) ?? null;
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

function stopPendingRemoval(room: RoomRecord, playerId: string) {
  const pendingTimer = room.pendingRemovalTimers.get(playerId);
  if (!pendingTimer) return;

  clearTimeout(pendingTimer);
  room.pendingRemovalTimers.delete(playerId);
}

function stopPendingRemovals(room: RoomRecord) {
  for (const pendingTimer of room.pendingRemovalTimers.values()) {
    clearTimeout(pendingTimer);
  }
  room.pendingRemovalTimers.clear();
}

function deleteRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  stopRoomTimer(room);
  stopPendingRemovals(room);
  rooms.delete(roomId);
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

function getPlayerForSession(sessionId: string) {
  const location = sessionToPlayer.get(sessionId);
  if (!location) return null;

  const room = rooms.get(location.roomId);
  if (!room) {
    sessionToPlayer.delete(sessionId);
    return null;
  }

  const player = room.state.players.find(
    (candidate) => candidate.playerId === location.playerId,
  );
  if (!player) {
    sessionToPlayer.delete(sessionId);
    stopPendingRemoval(room, location.playerId);
    return null;
  }

  return { roomId: location.roomId, room, player };
}

function attachSocketToPlayer(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
  playerId: string,
  sessionId: string,
) {
  socketToRoom.set(socket.id, roomId);
  socketToSession.set(socket.id, sessionId);
  sessionToPlayer.set(sessionId, { roomId, playerId });
  socket.join(roomId);
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
  if (!room || room.state.gameStatus !== "RUNNING") return;

  const nextDraw = drawNextNumber(room.remainingNumbers, room.state.calledNumbers);

  if (nextDraw.drawnNumber === null) {
    room.state.gameStatus = "FINISHED";
    stopRoomTimer(room);
    emitRoomState(io, roomId);
    return;
  }

  room.remainingNumbers = nextDraw.remainingNumbers;
  room.state.calledNumbers = nextDraw.calledNumbers;
  emitRoomState(io, roomId);
}

function removePlayerFromRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
  playerId: string,
  sessionId: string,
) {
  const room = rooms.get(roomId);
  if (!room) {
    sessionToPlayer.delete(sessionId);
    return;
  }

  stopPendingRemoval(room, playerId);
  room.state.players = room.state.players.filter((player) => player.playerId !== playerId);

  const currentLocation = sessionToPlayer.get(sessionId);
  if (currentLocation?.roomId === roomId && currentLocation.playerId === playerId) {
    sessionToPlayer.delete(sessionId);
  }

  if (room.state.players.length === 0) {
    deleteRoom(roomId);
    return;
  }

  if (!room.state.players.some((player) => player.socketId === room.state.hostSocketId)) {
    room.state.hostSocketId = room.state.players[0].socketId;
  }

  emitRoomState(io, roomId);
}

function removeFromRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  leaveSocketRoom: boolean,
) {
  const roomId = socketToRoom.get(socket.id);
  const sessionId = socketToSession.get(socket.id);
  if (!roomId || !sessionId) return;

  socketToRoom.delete(socket.id);
  socketToSession.delete(socket.id);
  if (leaveSocketRoom) socket.leave(roomId);

  const match = getPlayerForSession(sessionId);
  if (!match || match.roomId !== roomId || match.player.socketId !== socket.id) return;

  removePlayerFromRoom(io, roomId, match.player.playerId, sessionId);
}

function scheduleDisconnectRemoval(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  const roomId = socketToRoom.get(socket.id);
  const sessionId = socketToSession.get(socket.id);
  if (!roomId || !sessionId) return;

  socketToRoom.delete(socket.id);
  socketToSession.delete(socket.id);

  const match = getPlayerForSession(sessionId);
  if (!match || match.roomId !== roomId || match.player.socketId !== socket.id) return;

  stopPendingRemoval(match.room, match.player.playerId);
  const removalTimer = setTimeout(() => {
    removePlayerFromRoom(io, roomId, match.player.playerId, sessionId);
  }, DISCONNECT_GRACE_MS);

  match.room.pendingRemovalTimers.set(match.player.playerId, removalTimer);
}

function resumePlayer(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  sessionId: string,
) {
  const match = getPlayerForSession(sessionId);
  if (!match) return null;

  stopPendingRemoval(match.room, match.player.playerId);

  const previousSocketId = match.player.socketId;
  match.player.socketId = socket.id;
  if (match.room.state.hostSocketId === previousSocketId) {
    match.room.state.hostSocketId = socket.id;
  }

  attachSocketToPlayer(socket, match.roomId, match.player.playerId, sessionId);
  emitRoomState(io, match.roomId);
  if (previousSocketId !== socket.id) {
    io.sockets.sockets.get(previousSocketId)?.disconnect(true);
  }
  return match.roomId;
}

function createRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: CreateRoomPayload,
) {
  const name = trimName(payload.name);
  const sessionId = socketToSession.get(socket.id) ?? getSessionId(socket);
  if (!name) return socket.emit("room_error", { message: "Player name is required." });
  if (!canCreateRoom(socket.id)) {
    return socket.emit("room_error", {
      message: "All rooms are currently in use. Please join an existing room.",
    });
  }

  removeFromRoom(io, socket, true);

  const roomId = nextRoomId();
  if (!roomId) {
    return socket.emit("room_error", {
      message: "All rooms are currently in use. Please join an existing room.",
    });
  }
  const room: RoomRecord = {
    state: {
      roomId,
      players: [createPlayer(socket.id, name)],
      hostSocketId: socket.id,
      calledNumbers: [],
      winnerPlayerId: null,
      drawIntervalMs: DRAW_INTERVAL_MS,
      gameStatus: "WAITING",
    },
    remainingNumbers: [],
    drawTimer: null,
    pendingRemovalTimers: new Map(),
  };

  const player = room.state.players[0];
  rooms.set(roomId, room);
  attachSocketToPlayer(socket, roomId, player.playerId, sessionId);
  socket.emit("room_created", { roomId });
  emitRoomState(io, roomId);
}

function joinRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: JoinRoomPayload,
) {
  const name = trimName(payload.name);
  const sessionId = socketToSession.get(socket.id) ?? getSessionId(socket);
  const requestedRoomId = payload.roomId.trim();
  const matchedRoomId = findRoomId(requestedRoomId);
  const room = matchedRoomId ? rooms.get(matchedRoomId) : null;
  const normalizedName = name.toLowerCase();

  if (!name) {
    return socket.emit("room_error", {
      message: "Player name is required.",
      roomId: requestedRoomId,
    });
  }
  if (!room) {
    return socket.emit("room_error", {
      message: "Room does not exist.",
      roomId: requestedRoomId,
    });
  }
  const roomId = room.state.roomId;
  if (room.state.gameStatus !== "WAITING") {
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

  const player = createPlayer(socket.id, name);
  room.state.players.push(player);
  attachSocketToPlayer(socket, roomId, player.playerId, sessionId);
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
  if (room.state.gameStatus === "RUNNING") {
    return socket.emit("room_error", {
      message: "Game is already running.",
    });
  }

  stopRoomTimer(room);
  room.remainingNumbers = createShuffledNumbers();
  room.state.calledNumbers = [];
  room.state.winnerPlayerId = null;
  room.state.gameStatus = "RUNNING";
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
  if (room.state.gameStatus !== "RUNNING") {
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
      message: "BINGO claim is not valid yet.",
    });
  }

  room.state.winnerPlayerId = player.playerId;
  room.state.gameStatus = "FINISHED";
  stopRoomTimer(room);
  emitRoomState(io, roomId);
  emitBingoResult(io.to(roomId), {
    isValid: true,
    pattern: result.pattern,
    winnerPlayerId: player.playerId,
    message: `${player.name} has BINGO!`,
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
    const sessionId = getSessionId(socket);
    socketToSession.set(socket.id, sessionId);
    const resumedRoomId = resumePlayer(io, socket, sessionId);

    console.log(`Socket connected: ${socket.id}`);
    socket.emit("server:ready", {
      socketId: socket.id,
      roomId: resumedRoomId,
      resumed: resumedRoomId !== null,
    });
    socket.on("create_room", (payload) => createRoom(io, socket, payload));
    socket.on("join_room", (payload) => joinRoom(io, socket, payload));
    socket.on("start_game", () => startGame(io, socket));
    socket.on("claim_bingo", () => claimBingo(io, socket));
    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
      scheduleDisconnectRemoval(io, socket);
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
