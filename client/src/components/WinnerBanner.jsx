export default function WinnerBanner({ state }) {
  const names = state.players
    .filter((p) => state.winners?.includes(p.id))
    .map((p) => p.name);
  if (names.length === 0) return null;
  const total = state.leaderboard[0]?.total;

  return (
    <div className="winner-banner">
      🏆 {names.join(' & ')} {names.length > 1 ? 'tie for the win' : 'wins'} with {total} points!
    </div>
  );
}
