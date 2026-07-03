import ScoreInput from './ScoreInput.jsx';

export default function RoundPanel({ state, playerId, onSetScore }) {
  const round = state.currentRound;
  const finished = state.status === 'finished';
  const missing = state.players.filter((p) => state.scores[p.id]?.[round] === undefined);

  return (
    <div>
      <h2 className="panel-title">
        {finished ? `Round ${round} (final)` : `Round ${round} scores`}
      </h2>
      {!finished && (
        <p className="panel-hint">
          Anyone can enter a score for anyone. The round closes automatically once
          everyone is in.
        </p>
      )}
      <ul className="round-list">
        {state.players.map((p) => (
          <li key={p.id} className={`round-row${p.id === playerId ? ' is-you' : ''}`}>
            <span className="round-name">
              {p.name}
              {p.id === playerId && <span className="you-tag">you</span>}
            </span>
            <ScoreInput
              value={state.scores[p.id]?.[round]}
              disabled={false}
              ariaLabel={`Round ${round} score for ${p.name}`}
              onCommit={(value) => onSetScore(p.id, round, value)}
            />
          </li>
        ))}
      </ul>
      {!finished && missing.length > 0 && (
        <p className="panel-hint waiting">
          Waiting on: {missing.map((p) => p.name).join(', ')}
        </p>
      )}
    </div>
  );
}
