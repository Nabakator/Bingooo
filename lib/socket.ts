import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  SocketAuth,
  ServerToClientEvents,
} from "../types/socket";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
const SESSION_STORAGE_KEY = "bingooo-session-id";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  const existingSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existingSessionId) return existingSessionId;

  const nextSessionId = createSessionId();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}

export function getSocket() {
  if (typeof window === "undefined") {
    throw new Error("Socket client is only available in the browser.");
  }

  if (!socket) {
    const auth: SocketAuth = {
      sessionId: getSessionId(),
    };

    socket = io({
      autoConnect: false,
      auth,
    });
  }

  return socket;
}
