import { useId } from "react";

export type CollectionScoreSort = "alphabetical" | "visits" | "days";
export interface ScoreboardStat {
  key: string;
  label: string;
  value: number | string;
  active: boolean;
  title: string;
  onClick: () => void;
}

export default function CollectionScoreboard({
  stats,
  className = "",
}: {
  stats: ScoreboardStat[];
  className?: string;
}) {
  const id = useId();
  return (
    <dl className={`city-overview-totals ${className}`.trim()}>
      {stats.map((stat) => (
        <div key={stat.key} data-active={stat.active}>
          <dt id={`${id}-${stat.key}-label`}>{stat.label}</dt>
          <dd>
            <button
              type="button"
              aria-labelledby={`${id}-${stat.key}-label ${id}-${stat.key}-value`}
              aria-pressed={stat.active}
              title={stat.title}
              onClick={stat.onClick}
            >
              <span id={`${id}-${stat.key}-value`}>{stat.value}</span>
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
