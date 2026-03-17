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

const CARD_LABELS = ["B", "I", "N", "G", "O"] as const;
type CardLabel = (typeof CARD_LABELS)[number];

const TAB_CLASS_BY_LABEL: Record<CardLabel, string> = {
  B: styles.tabB,
  I: styles.tabI,
  N: styles.tabN,
  G: styles.tabG,
  O: styles.tabO,
};

const BALL_CLASS_BY_LABEL: Record<CardLabel, string> = {
  B: styles.ballB,
  I: styles.ballI,
  N: styles.ballN,
  G: styles.ballG,
  O: styles.ballO,
};

function getNumberLabel(value: number): CardLabel {
  if (value <= 15) return "B";
  if (value <= 30) return "I";
  if (value <= 45) return "N";
  if (value <= 60) return "G";
  return "O";
}

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
  const recentCalledNumbers = calledNumbers.slice(-8).reverse();
  const calledSet = new Set(calledNumbers);
  const isHost = Boolean(roomState && roomState.hostSocketId === socketId);
  const canStartGame = Boolean(isHost && roomState?.gameStatus === "waiting");
  const canClaimBingo = Boolean(currentPlayer && roomState?.gameStatus === "running");
  const bannerText = bingoResult?.message ?? error ?? "Waiting for players.";

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
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.skyGlow} />
        <div className={styles.sunHalo} />
        <div className={styles.cloudOne} />
        <div className={styles.cloudTwo} />
        <div className={styles.hillBack} />
        <div className={styles.hillFront} />
      </div>

      <div className={styles.shell}>
        <header className={styles.topBar}>
          <div className={styles.brandBlock}>
            <p className={styles.brandKicker}>Casual Multiplayer Bingo</p>
            <h1 className={styles.title}>Bingooo</h1>
            <div className={styles.metaRow}>
              <span className={styles.metaPill}>Status: {status}</span>
              <span className={styles.metaPill}>Room: {roomState?.roomId ?? "Lobby"}</span>
              <span className={styles.metaPill}>Game: {roomState?.gameStatus ?? "idle"}</span>
            </div>
          </div>

          <section className={styles.calledDeck} aria-label="Latest called numbers">
            <div className={styles.calledHeader}>
              <div>
                <p className={styles.panelEyebrow}>Top Calls</p>
                <h2 className={styles.panelTitle}>Number Balls</h2>
              </div>
              <div className={styles.latestCallBadge}>
                Latest: {latestCalledNumber ?? "-"}
              </div>
            </div>
            <div className={styles.ballRow}>
              {recentCalledNumbers.length > 0 ? (
                recentCalledNumbers.map((value, index) => {
                  const label = getNumberLabel(value);
                  return (
                    <div
                      key={`${value}-${index}`}
                      className={`${styles.numberBall} ${BALL_CLASS_BY_LABEL[label]} ${
                        index === 0 ? styles.latestBall : ""
                      }`}
                    >
                      <span className={styles.ballLetter}>{label}</span>
                      <span className={styles.ballValue}>{value}</span>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyBalls}>No numbers called yet</div>
              )}
            </div>
          </section>
        </header>

        <section className={styles.statusBanner}>
          <div>
            <p className={styles.panelEyebrow}>Match Banner</p>
            <h2 className={styles.bannerTitle}>{bannerText}</h2>
          </div>
          <div className={styles.bannerMeta}>
            <span>Winner: {winnerLabel}</span>
            <span>Socket: {socketId ?? "Not connected"}</span>
          </div>
        </section>

        <div className={styles.gameLayout}>
          <aside className={styles.playersRail}>
            <div className={styles.railHeader}>
              <p className={styles.panelEyebrow}>Room Roster</p>
              <h2 className={styles.panelTitle}>Players</h2>
            </div>
            {roomState ? (
              <ul className={styles.playerList}>
                {roomState.players.map((player) => (
                  <li
                    key={player.playerId}
                    className={`${styles.playerCard} ${
                      player.socketId === socketId ? styles.playerCurrent : ""
                    }`}
                  >
                    <div className={styles.playerNameRow}>
                      <span className={styles.playerName}>{player.name}</span>
                      {player.socketId === roomState.hostSocketId ? (
                        <span className={styles.playerBadge}>HOST</span>
                      ) : null}
                    </div>
                    <div className={styles.playerTags}>
                      {player.socketId === socketId ? (
                        <span className={styles.playerTag}>YOU</span>
                      ) : null}
                      {player.playerId === roomState.winnerPlayerId ? (
                        <span className={styles.playerTag}>WINNER</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyText}>Create or join a room to seat players.</p>
            )}
          </aside>

          <section className={styles.boardStage}>
            <div className={styles.boardShell}>
              <div className={styles.boardHeader}>
                <div>
                  <p className={styles.panelEyebrow}>Your Board</p>
                  <h2 className={styles.panelTitle}>
                    {currentPlayer ? `${currentPlayer.name}'s Card` : "Waiting for Card"}
                  </h2>
                </div>
                <div className={styles.boardStats}>
                  <span className={styles.statChip}>Calls: {calledNumbers.length}</span>
                  <span className={styles.statChip}>
                    Draw Speed: {roomState?.drawIntervalMs ?? 0}ms
                  </span>
                </div>
              </div>

              {currentPlayer ? (
                <div className={styles.cardFrame}>
                  <table className={styles.card} aria-label="Bingo card">
                    <thead>
                      <tr>
                        {CARD_LABELS.map((label) => (
                          <th
                            key={label}
                            className={`${styles.cardHeader} ${TAB_CLASS_BY_LABEL[label]}`}
                            scope="col"
                          >
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
                </div>
              ) : (
                <div className={styles.emptyBoard}>
                  <p>No card assigned yet.</p>
                  <p>Create or join a room to load your board.</p>
                </div>
              )}

              <div className={styles.boardFooter}>
                <button
                  className={styles.bingoButton}
                  type="button"
                  disabled={!canClaimBingo}
                  onClick={claimBingo}
                >
                  Bingo
                </button>
                <p className={styles.boardHint}>
                  The free centre stays marked. Number tiles light up automatically as calls arrive.
                </p>
              </div>
            </div>
          </section>

          <aside className={styles.controlDock}>
            <section className={styles.controlCard}>
              <div className={styles.railHeader}>
                <p className={styles.panelEyebrow}>Room Actions</p>
                <h2 className={styles.panelTitle}>Controls</h2>
              </div>
              <label className={styles.field}>
                <span>Player Name</span>
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Room ID</span>
                <input
                  value={roomIdInput}
                  onChange={(event) => setRoomIdInput(event.target.value.toUpperCase())}
                />
              </label>
              <div className={styles.actionStack}>
                <button className={styles.primaryButton} type="button" onClick={createRoom}>
                  Create Room
                </button>
                <button className={styles.secondaryButton} type="button" onClick={joinRoom}>
                  Join Room
                </button>
                <button
                  className={styles.startButton}
                  type="button"
                  disabled={!canStartGame}
                  onClick={startGame}
                >
                  Start Game
                </button>
              </div>
            </section>

            <section className={styles.controlCard}>
              <div className={styles.railHeader}>
                <p className={styles.panelEyebrow}>Game Feed</p>
                <h2 className={styles.panelTitle}>Status</h2>
              </div>
              <div className={styles.feedRow}>
                <span className={styles.feedLabel}>Claim</span>
                <span>{bingoResult?.pattern ?? "None"}</span>
              </div>
              <div className={styles.feedRow}>
                <span className={styles.feedLabel}>Result</span>
                <span>{bingoResult?.message ?? "No bingo claims yet."}</span>
              </div>
              <div className={styles.feedRow}>
                <span className={styles.feedLabel}>Error</span>
                <span>{error ?? "None"}</span>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
