export function Stars({ rating, size = 0.85 }: { rating: number; size?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="stars" style={{ fontSize: `${size}rem` }} aria-hidden="true">
      {"★".repeat(full)}
      {half ? "⯨" : ""}
      {"☆".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
    </span>
  );
}

export function Rating({ rating, count, showValue = true }: { rating: number; count: number; showValue?: boolean }) {
  if (!count) return <span className="muted small">New — no reviews yet</span>;
  return (
    <span className="rating">
      <Stars rating={rating} />
      {showValue && <strong>{rating.toFixed(1)}</strong>}
      <span className="muted">({count})</span>
    </span>
  );
}
