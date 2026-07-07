import { useState } from 'react';
import { useGameSocket } from './useGameSocket.js';
import Leaderboard from './components/Leaderboard.jsx';
import RoundPanel from './components/RoundPanel.jsx';
import ScoreGrid from './components/ScoreGrid.jsx';
import TableMap from './components/TableMap.jsx';
import AddPlayer from './components/AddPlayer.jsx';
import WinnerBanner from './components/WinnerBanner.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';

const nameKey = (code) => `shanghai:${code}:name`;

export default function Game({ code, navigate }) {
  const [name, setName] = useState(() => localStorage.getItem(nameKey(code)) || '');
  const [draftName, setDraftName] = useState(() => localStorage.getItem('shanghai:name') || '');
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const { state, playerId, joinError, setScore, addPlayer, undo, redo } = useGameSocket(
    code,
    name
  );

  const showError = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const joinAs = (e) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    localStorage.setItem(nameKey(code), trimmed);
    localStorage.setItem('shanghai:name', trimmed);
    setName(trimmed);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  };

  const handleSetScore = (targetPlayerId, round, value) => {
    setScore(targetPlayerId, round, value, (res) => {
      if (res?.error) showError(res.error);
    });
  };

  const handleAddPlayer = (playerName, cb) => {
    addPlayer(playerName, (res) => {
      if (res?.error) showError(res.error);
      cb?.(res);
    });
  };

  const handleUndo = () => undo((res) => res?.error && showError(res.error));
  const handleRedo = () => redo((res) => res?.error && showError(res.error));

  if (!name) {
    return (
      <div className="home">
        <form className="home-card" onSubmit={joinAs}>
          <h1 className="home-title">Shanghai</h1>
          <p className="home-subtitle">
            Joining game <strong className="code-badge">{code}</strong>. What's your name?
          </p>
          <input
            className="input"
            placeholder="Your name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={40}
            autoFocus
          />
          <button className="btn btn-primary btn-big" type="submit" disabled={!draftName.trim()}>
            Join game
          </button>
        </form>
      </div>
    );
  }

  if (joinError) {
    return (
      <div className="home">
        <div className="home-card">
          <h1 className="home-title">Shanghai</h1>
          <div className="error">{joinError}</div>
          <button className="btn" onClick={() => navigate('/')}>Back to home</button>
        </div>
      </div>
    );
  }

  if (!state) {
    return <div className="loading">Connecting…</div>;
  }

  return (
    <div className="game">
      <header className="game-header">
        <div className="game-header-left">
          <h1 className="game-title">Shanghai</h1>
          <span className="code-badge" title="Game code">{state.code}</span>
        </div>
        <div className="game-header-right">
          <span className="round-pill">
            {state.status === 'finished'
              ? 'Game over'
              : `Round ${state.currentRound} of ${state.totalRounds}`}
          </span>
          <div className="undo-redo" role="group" aria-label="Undo and redo">
            <button
              className="btn btn-small"
              onClick={handleUndo}
              disabled={!state.canUndo}
              title="Undo the last score change"
            >
              ↶ Undo
            </button>
            <button
              className="btn btn-small"
              onClick={handleRedo}
              disabled={!state.canRedo}
              title="Redo the last undone change"
            >
              Redo ↷
            </button>
          </div>
          <button className="btn btn-small" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      {state.status === 'finished' && <WinnerBanner state={state} />}

      <div className="panels">
        <section className="panel">
          <RoundPanel state={state} playerId={playerId} onSetScore={handleSetScore} />
          <AddPlayer onAdd={handleAddPlayer} />
        </section>
        <section className="panel">
          <TableMap state={state} playerId={playerId} />
        </section>
        <section className="panel">
          <Leaderboard state={state} playerId={playerId} />
        </section>
      </div>

      <section className="panel panel-wide">
        <ScoreGrid state={state} playerId={playerId} onSetScore={handleSetScore} />
      </section>

      <section className="panel panel-wide">
        <HistoryPanel state={state} />
      </section>
    </div>
  );
}
