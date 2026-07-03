const basisLabel = (state) => {
  const { basis, round } = state.seating;
  if (basis === 'random') return 'Round 1 — seats drawn at random';
  if (basis === 'cumulative') return 'Final round — seeded by cumulative totals';
  return `Seeded by round ${round - 1} results`;
};

export default function TableMap({ state, playerId }) {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const totals = new Map(state.leaderboard.map((e) => [e.playerId, e.total]));
  const { basis, round, tables } = state.seating;
  const prevRound = round - 1;

  const seedValue = (id) => {
    if (basis === 'cumulative') return totals.get(id);
    if (basis === 'round') return state.scores[id]?.[prevRound];
    return undefined;
  };

  return (
    <div>
      <h2 className="panel-title">
        {state.status === 'finished' ? 'Final round tables' : `Tables for round ${round}`}
      </h2>
      <p className="panel-hint">{basisLabel(state)}</p>
      <div className="table-map">
        {tables.map((ids, i) => (
          <div key={i} className={`table-card${i === 0 ? ' top-table' : ''}`}>
            <div className="table-card-header">
              <span className="table-card-name">Table {i + 1}</span>
              {i === 0 && tables.length > 1 && <span className="top-tag">top table</span>}
            </div>
            <ul className="table-seats">
              {ids.map((id) => (
                <li key={id} className={`seat${id === playerId ? ' is-you' : ''}`}>
                  <span className="seat-name">{players.get(id)?.name ?? '?'}</span>
                  {seedValue(id) !== undefined && (
                    <span className="seat-score">{seedValue(id)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {tables.length === 0 && <p className="panel-hint">No players yet.</p>}
      </div>
    </div>
  );
}
