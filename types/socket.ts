import type { BingoPattern, Card } from "../lib/bingo";

export type GameStatus = "waiting" | "running" | "finished";

export type Player = {
  playerId: string;
  name: string;
  socketId: string;
  card: Card;
};

export type RoomState = {
  roomId: string;
  players: Player[];
  hostSocketId: string;
  calledNumbers: number[];
  winnerPlayerId: string | null;
  drawIntervalMs: number;
  gameStatus: GameStatus;
};

export type ServerReadyPayload = {
  socketId: string;
};

export type CreateRoomPayload = {
  name: string;
};

export type JoinRoomPayload = {
  roomId: string;
  name: string;
};

export type RoomCreatedPayload = {
  roomId: string;
};

export type RoomErrorPayload = {
  message: string;
  roomId?: string;
};

export type BingoResultPayload = {
  isValid: boolean;
  pattern: BingoPattern;
  winnerPlayerId: string | null;
  message: string;
};

export interface ServerToClientEvents {
  "server:ready": (payload: ServerReadyPayload) => void;
  room_created: (payload: RoomCreatedPayload) => void;
  room_state: (payload: RoomState) => void;
  room_error: (payload: RoomErrorPayload) => void;
  bingo_result: (payload: BingoResultPayload) => void;
}

export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload) => void;
  join_room: (payload: JoinRoomPayload) => void;
  start_game: () => void;
  claim_bingo: () => void;
}
