import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// Connects once a name is chosen, joins the game room, and keeps `state` in
// sync with server broadcasts. Rejoins automatically on reconnect.
export function useGameSocket(code, name) {
  const [state, setState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!name) return undefined;
    const socket = io();
    socketRef.current = socket;

    const join = () => {
      socket.emit('game:join', { code, name }, (res) => {
        if (res?.error) {
          setJoinError(res.error);
        } else {
          setJoinError(null);
          setPlayerId(res.playerId);
          setState(res.state);
        }
      });
    };

    socket.on('connect', join);
    socket.on('game:state', setState);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, name]);

  const setScore = (targetPlayerId, round, value, cb) => {
    socketRef.current?.emit('score:set', { code, playerId: targetPlayerId, round, value }, cb);
  };

  const addPlayer = (playerName, cb) => {
    socketRef.current?.emit('player:add', { code, name: playerName }, cb);
  };

  const undo = (cb) => {
    socketRef.current?.emit('history:undo', { code }, cb);
  };

  const redo = (cb) => {
    socketRef.current?.emit('history:redo', { code }, cb);
  };

  return { state, playerId, joinError, setScore, addPlayer, undo, redo };
}
