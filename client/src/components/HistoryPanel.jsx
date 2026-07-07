// SQLite's datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" (no zone), so
// normalise it to an ISO instant before turning it into a relative label.
function timeAgo(createdAt) {
  if (!createdAt) return '';
  const then = new Date(`${createdAt.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// A small glyph per event type so the feed scans quickly.
const ICONS = {
  score: '✎',
  undo: '↶',
  redo: '↷',
  player_add: '＋',
  join: '👋'
};

export default function HistoryPanel({ state }) {
  const history = state.history || [];

  return (
    <div>
      <h2 className="panel-title">History</h2>
      <p className="panel-hint">
        Every change, and who made it. Use Undo / Redo above to step back and
        forth through score edits.
      </p>
      {history.length === 0 ? (
        <p className="history-empty">No changes yet.</p>
      ) : (
        <ul className="history-list">
          {history.map((e) => (
            <li key={e.id} className={`history-item history-${e.type}`}>
              <span className="history-icon" aria-hidden="true">
                {ICONS[e.type] || '•'}
              </span>
              <span className="history-body">
                <span className="history-text">
                  <strong className="history-actor">{e.actor}</strong>{' '}
                  <span className={e.type === 'score' && e.undone ? 'history-undone' : ''}>
                    {e.description}
                  </span>
                  {e.type === 'score' && e.undone && (
                    <span className="history-badge">undone</span>
                  )}
                </span>
                <time className="history-time">{timeAgo(e.createdAt)}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
