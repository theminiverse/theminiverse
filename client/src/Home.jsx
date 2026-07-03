import { useState } from 'react';

export default function Home({ navigate }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const createGame = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/games', { method: 'POST' });
      if (!res.ok) throw new Error('Could not create game');
      const { code } = await res.json();
      navigate(`/g/${code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const joinGame = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setError(null);
    const res = await fetch(`/api/games/${code}`);
    if (!res.ok) {
      setError(`No game found with code ${code}`);
      return;
    }
    navigate(`/g/${code}`);
  };

  return (
    <div className="home">
      <div className="home-card">
        <h1 className="home-title">Shanghai</h1>
        <p className="home-subtitle">
          9 rounds. Lowest score wins. One shared scoreboard for the whole group.
        </p>
        <button className="btn btn-primary btn-big" onClick={createGame} disabled={creating}>
          {creating ? 'Creating…' : 'Start a new game'}
        </button>
        <div className="home-divider">or join an existing game</div>
        <form className="home-join" onSubmit={joinGame}>
          <input
            className="input code-input"
            placeholder="Game code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
          />
          <button className="btn" type="submit" disabled={!joinCode.trim()}>
            Join
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
