"use client";

import { useEffect, useState } from "react";

import { FREE_SPACE } from "../lib/bingo";
import { getSocket } from "../lib/socket";
import type {
  BingoResultPayload,
  RoomCreatedPayload,
  RoomErrorPayload,
  RoomState,
  ServerReadyPayload,
} from "../types/socket";
import styles from "./page.module.css";

const CARD_LABELS = ["B", "I", "N", "G", "O"];

export default function HomePage() {
  const [status, setStatus] = useState("disconnected");
  const [socketId, setSocketId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("Player");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [bingoResult, setBingoResult] = useState<BingoResultPayload | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setStatus("connected");
      setSocketId(socket.id ?? null);
      setError(null);
    };
    const onDisconnect = (reason: string) => {
      setStatus(`disconnected (${reason})`);
      setSocketId(null);
      setRoomState(null);
      setBingoResult(null);
    };
    const onConnectError = (connectError: Error) => {
      setStatus("connection error");
      setError(connectError.message);
    };
    const onServerReady = ({ socketId: readySocketId }: ServerReadyPayload) => {
      setSocketId(readySocketId);
    };
    const onRoomCreated = ({ roomId }: RoomCreatedPayload) => {
      setRoomIdInput(roomId);
      setError(null);
      setBingoResult(null);
    };
    const onRoomState = (nextRoomState: RoomState) => {
      setRoomState(nextRoomState);
      setRoomIdInput(nextRoomState.roomId);
      setError(null);
      if (nextRoomState.gameStatus !== "finished" && nextRoomState.calledNumbers.length === 0) {
        setBingoResult(null);
      }
    };
    const onRoomError = ({ message }: RoomErrorPayload) => {
      setError(message);
    };
    const onBingoResult = (payload: BingoResultPayload) => {
      setBingoResult(payload);
      setError(null);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("server:ready", onServerReady);
    socket.on("room_created", onRoomCreated);
    socket.on("room_state", onRoomState);
    socket.on("room_error", onRoomError);
    socket.on("bingo_result", onBingoResult);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("server:ready", onServerReady);
      socket.off("room_created", onRoomCreated);
      socket.off("room_state", onRoomState);
      socket.off("room_error", onRoomError);
      socket.off("bingo_result", onBingoResult);
      socket.disconnect();
    };
  }, []);

  const currentPlayer =
    roomState?.players.find((player) => player.socketId === socketId) ?? null;
  const winner =
    roomState?.players.find((player) => player.playerId === roomState.winnerPlayerId) ?? null;
  const winnerLabel = winner?.name ?? roomState?.winnerPlayerId ?? "None";
  const calledNumbers = roomState?.calledNumbers ?? [];
  const latestCalledNumber = calledNumbers.at(-1) ?? null;
  const calledSet = new Set(calledNumbers);
  const isHost = Boolean(roomState && roomState.hostSocketId === socketId);
  const canStartGame = Boolean(isHost && roomState?.gameStatus === "waiting");
  const canClaimBingo = Boolean(currentPlayer && roomState?.gameStatus === "running");
  const createRoom = () => {
    setError(null);
    getSocket().emit("create_room", { name: playerName });
  };
  const joinRoom = () => {
    setError(null);
    getSocket().emit("join_room", { roomId: roomIdInput, name: playerName });
  };
  const startGame = () => {
    setError(null);
    getSocket().emit("start_game");
  };
  const claimBingo = () => {
    setError(null);
    getSocket().emit("claim_bingo");
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Bingooo</h1>
          <p>Status: {status}</p>
          <p>Room: {roomState?.roomId ?? "No room"}</p>
          <p>Game: {roomState?.gameStatus ?? "idle"}</p>
          <p>Winner: {winnerLabel}</p>
        </div>
        <p>Socket: {socketId ?? "Not connected"}</p>
      </header>

      <section className={styles.section}>
        <h2>Called Numbers</h2>
        <p className={styles.latestLabel}>Latest Called Number</p>
        <p className={styles.latestNumber}>{latestCalledNumber ?? "-"}</p>
        <ol className={styles.calledNumbers}>
          {calledNumbers.length === 0 ? (
            <li>None</li>
          ) : (
            calledNumbers.map((number, index) => <li key={`${number}-${index}`}>{number}</li>)
          )}
        </ol>
      </section>

      <section className={styles.section}>
        <h2>Your Card</h2>
        {currentPlayer ? (
          <table className={styles.card} aria-label="Bingo card">
            <thead>
              <tr>
                {CARD_LABELS.map((label) => (
                  <th key={label} className={styles.cardHeader} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentPlayer.card.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((value) => (
                    <td
                      key={`${rowIndex}-${String(value)}`}
                      className={
                        value === FREE_SPACE
                          ? styles.free
                          : calledSet.has(value)
                            ? styles.marked
                            : styles.cell
                      }
                    >
                      {value === FREE_SPACE ? "FREE" : value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No card assigned.</p>
        )}
        <button
          className={styles.bingoButton}
          type="button"
          disabled={!canClaimBingo}
          onClick={claimBingo}
        >
          Bingo
        </button>
      </section>

      <section className={styles.section}>
        <h2>Room Controls</h2>
        <div className={styles.controls}>
          <label>
            Player Name
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={createRoom}
          >
            Create Room
          </button>
          <label>
            Room ID
            <input
              value={roomIdInput}
              onChange={(event) => setRoomIdInput(event.target.value.toUpperCase())}
            />
          </label>
          <button
            type="button"
            onClick={joinRoom}
          >
            Join Room
          </button>
          {isHost ? (
            <button
              type="button"
              disabled={!canStartGame}
              onClick={startGame}
            >
              Start Game
            </button>
          ) : null}
        </div>
        <p role="alert">Error: {error ?? "None"}</p>
        <p>
          Bingo Result:{" "}
          {bingoResult
            ? `${bingoResult.message} (${bingoResult.pattern ?? "no pattern"})`
            : "None"}
        </p>
      </section>

      <section className={styles.section}>
        <h2>Players</h2>
        {roomState ? (
          <ul className={styles.players}>
            {roomState.players.map((player) => (
              <li key={player.playerId}>
                {player.name}
                {player.socketId === roomState.hostSocketId ? " (host)" : ""}
                {player.playerId === roomState.winnerPlayerId ? " (winner)" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No room players yet.</p>
        )}
      </section>
    </main>
  );
}
