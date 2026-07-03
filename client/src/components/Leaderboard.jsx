export default function Leaderboard({ state, playerId }) {
  return (
    <div>
      <h2 className="panel-title">Cumulative leaderboard</h2>
      <p className="panel-hint">Lowest total wins.</p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>#</th>
            <th className="col-name">Player</th>
            <th className="col-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {state.leaderboard.map((entry) => (
            <tr
              key={entry.playerId}
              className={[
                entry.rank === 1 ? 'is-leader' : '',
                entry.playerId === playerId ? 'is-you' : ''
              ].join(' ')}
            >
              <td>{entry.rank}</td>
              <td className="col-name">
                {entry.name}
                {entry.playerId === playerId && <span className="you-tag">you</span>}
              </td>
              <td className="col-num">{entry.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
