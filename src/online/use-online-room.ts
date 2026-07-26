import PartySocket from 'partysocket';
import { useEffect, useRef, useState } from 'react';
import type { OnlineBuild, OnlineSeat } from '../core/online-match';
import { encodeMessage, parseServerMessage, type RoomView, type ServerMessage } from './protocol';

export type OnlineBattleMessage = Extract<ServerMessage, { type: 'battle-result' }>;
export type OnlineConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

const tokenStorageKey = (roomId: string) => `code-monsters:online-seat:${roomId}`;

export function useOnlineRoom(roomId?: string) {
  const socketRef = useRef<PartySocket | undefined>(undefined);
  const [connection, setConnection] = useState<OnlineConnectionStatus>(roomId ? 'connecting' : 'idle');
  const [seat, setSeat] = useState<OnlineSeat>();
  const [runSeed, setRunSeed] = useState<number>();
  const [room, setRoom] = useState<RoomView>();
  const [battle, setBattle] = useState<OnlineBattleMessage>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!roomId) {
      setConnection('idle');
      setSeat(undefined);
      setRunSeed(undefined);
      setRoom(undefined);
      setBattle(undefined);
      setError(undefined);
      return;
    }

    setConnection('connecting');
    const socket = new PartySocket({
      host: import.meta.env.VITE_PARTY_HOST ?? window.location.host,
      party: 'match-room',
      room: roomId,
      query: () => ({ seatToken: window.localStorage.getItem(tokenStorageKey(roomId)) }),
    });
    socketRef.current = socket;
    socket.addEventListener('open', () => {
      setConnection('connected');
      setError(undefined);
    });
    socket.addEventListener('close', () => setConnection('disconnected'));
    socket.addEventListener('error', () => setConnection('disconnected'));
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === 'welcome') {
        window.localStorage.setItem(tokenStorageKey(roomId), message.seatToken);
        setSeat(message.seat);
        setRunSeed(message.runSeed);
        setRoom(message.room);
        return;
      }
      if (message.type === 'room-state') {
        setRoom(message.room);
        return;
      }
      if (message.type === 'battle-result') {
        setBattle(message);
        return;
      }
      setError(message.message);
      if (!message.recoverable) socket.close(4003, message.message);
    });

    return () => {
      socketRef.current = undefined;
      socket.close(1000, 'Leaving room');
    };
  }, [roomId]);

  const send = (message: Parameters<typeof encodeMessage>[0]) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('対戦室に再接続しています。少し待ってからもう一度お試しください');
      return false;
    }
    socket.send(encodeMessage(message));
    return true;
  };

  return {
    connection,
    seat,
    runSeed,
    room,
    battle,
    error,
    clearError: () => setError(undefined),
    consumeBattle: () => setBattle(undefined),
    submitBuild: (cycle: number, build: OnlineBuild) => send({ type: 'submit-build', cycle, build }),
    continueMatch: (battleNumber: number) => send({ type: 'continue', battleNumber }),
  };
}
