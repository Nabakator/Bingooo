import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../types/socket";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (typeof window === "undefined") {
    throw new Error("Socket client is only available in the browser.");
  }

  if (!socket) {
    socket = io({
      autoConnect: false,
    });
  }

  return socket;
}
