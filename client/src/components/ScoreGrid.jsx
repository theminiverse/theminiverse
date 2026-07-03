import ScoreInput from './ScoreInput.jsx';

export default function ScoreGrid({ state, playerId, onSetScore }) {
  const rounds = Array.from({ length: state.totalRounds }, (_, i) => i + 1);
  const totals = new Map(state.leaderboard.map((e) => [e.playerId, e.total]));
  const finished = state.status === 'finished';

  return (
    <div>
      <h2 className="panel-title">All rounds</h2>
      <p className="panel-hint">
        Every cell is editable — fix typos or back-fill scores for late joiners.
        Totals update for everyone instantly.
      </p>
      <div className="grid-scroll">
        <table className="score-grid">
          <thead>
            <tr>
              <th className="col-name">Player</th>
              {rounds.map((r) => (
                <th
                  key={r}
                  className={!finished && r === state.currentRound ? 'current-round' : ''}
                >
                  R{r}
                </th>
              ))}
              <th className="col-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((p) => (
              <tr key={p.id} className={p.id === playerId ? 'is-you' : ''}>
                <td className="col-name">{p.name}</td>
                {rounds.map((r) => (
                  <td
                    key={r}
                    className={!finished && r === state.currentRound ? 'current-round' : ''}
                  >
                    <ScoreInput
                      value={state.scores[p.id]?.[r]}
                      disabled={!finished && r > state.currentRound}
                      ariaLabel={`Round ${r} score for ${p.name}`}
                      onCommit={(value) => onSetScore(p.id, r, value)}
                    />
                  </td>
                ))}
                <td className="col-num grid-total">{totals.get(p.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
