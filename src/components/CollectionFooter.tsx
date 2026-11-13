import type { ReactNode } from "react";

export default function CollectionFooter({
  countries,
  visited,
  actions,
}: {
  countries: number;
  visited: number;
  actions?: ReactNode;
}) {
  const totals = (
    <>
      <div className="journey-total">
        <strong>{countries}</strong>
        <span>{countries === 1 ? "country" : "countries"}</span>
      </div>
      <div className="journey-total">
        <strong>{visited}</strong>
        <span>{visited === 1 ? "city" : "cities"}</span>
      </div>
    </>
  );
  return (
    <footer className="collection-bottom" aria-label="Visited places">
      <div
        className={`journey-stats${actions ? " journey-stats--compact" : ""}`}
      >
        <span className="stats-label">Visited</span>
        {actions ? <div className="journey-totals">{totals}</div> : totals}
      </div>
      {actions}
    </footer>
  );
}
