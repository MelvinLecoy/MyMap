import { memo, useId, useRef } from "react";
import { Info, X } from "lucide-react";
import referenceData from "../generated/country-reference.json";
import {
  COUNTRY_METRICS,
  compactCountryValue,
  countryMetricContext,
  createCountryReferenceIndex,
  formatStanding,
  type CountryMetric,
  type CountryReferenceData,
} from "../lib/country-reference";

// One immutable index for every profile. No network requests or refresh loop.
const reference = createCountryReferenceIndex(
  referenceData as CountryReferenceData,
);
const labels = { population: "Population", area: "Total area", gdp: "GDP" };
const units = { population: "people", area: "km²", gdp: "USD" };

function CompactValue({ value }: { value: number | null }) {
  if (value === null) return <>—</>;
  const formatted = compactCountryValue(value);
  return (
    <>
      {formatted.amount}
      <span className="reference-value-suffix">{formatted.suffix}</span>
    </>
  );
}

function CountryMetricColumn({
  code,
  metric,
}: {
  code: string;
  metric: CountryMetric;
}) {
  const context = countryMetricContext(reference, code, metric);
  const country = reference.byCode.get(code)!;
  const figure = context.reference;
  const standing = context.standing;
  const averageTitle = (scope: string, count: number) =>
    `${scope} arithmetic average · ${count} countries with reported data · ${units[metric]}`;
  return (
    <div className="country-reference-metric" data-metric={metric}>
      <dt>{labels[metric]}</dt>
      <dd className="country-reference-metric-body">
        <div
          className="country-reference-value"
          title={
            figure
              ? `${figure.value.toLocaleString("en", { maximumFractionDigits: 2 })} ${units[metric]}`
              : "Comparable figure unavailable in the selected source"
          }
        >
          <CompactValue value={figure?.value ?? null} />
        </div>
        <p className="country-reference-vintage">
          {units[metric]}
          {figure && metric !== "area" && <> · {figure.year ?? "est."}</>}
        </p>
        <div className="country-standing-label">
          <span>Standing</span>
          <strong>
            {standing === null ? "—" : formatStanding(standing)}
            <small> / 100</small>
          </strong>
        </div>
        <div
          className="country-standing-track"
          role={standing === null ? undefined : "meter"}
          aria-hidden={standing === null ? true : undefined}
          aria-label={`${labels[metric]} global standing`}
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={standing ?? undefined}
          aria-valuetext={
            standing === null
              ? "Not available"
              : `${formatStanding(standing)} out of 100; world leader ${context.leader?.name}`
          }
        >
          <span style={{ width: `${standing ?? 0}%` }} />
        </div>
        <div className="country-reference-averages">
          <p title={averageTitle("World", context.worldCount)}>
            <span>World avg</span>
            <strong>
              <CompactValue value={context.worldAverage} />
            </strong>
          </p>
          <p title={averageTitle(country.continent, context.continentCount)}>
            <span>Cont. avg</span>
            <strong>
              <CompactValue value={context.continentAverage} />
            </strong>
          </p>
        </div>
      </dd>
    </div>
  );
}

function ReferenceExplanation({ code }: { code: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const country = reference.byCode.get(code)!;
  const sourceIds = [
    ...new Set([
      ...COUNTRY_METRICS.flatMap((key) => country.metrics[key]?.source ?? []),
      ...Object.values(country.sources),
    ]),
  ];
  return (
    <>
      <button
        type="button"
        className="country-reference-info"
        aria-label="About country data and global standing"
        onClick={() => dialog.current?.showModal()}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        className="country-reference-explanation"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div>
          <div className="country-reference-explanation-heading">
            <h2 id={titleId}>The numbers, in perspective</h2>
            <button
              type="button"
              aria-label="Close country data explanation"
              onClick={() => dialog.current?.close()}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p>
            <strong>Global standing</strong> places each country on a 1–100
            scale. The largest scores 100; 90 means above roughly 90% of
            countries. Equal values share their standing.
          </p>
          <dl className="country-reference-leaders">
            {COUNTRY_METRICS.map((metric) => {
              const leader = reference.benchmarks[metric].leader;
              return (
                <div key={metric}>
                  <dt>{labels[metric]} leader</dt>
                  <dd>
                    {leader?.name ?? "—"}
                    <span>100</span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p>
            <strong>Averages</strong> are arithmetic averages per country, using
            available figures in the fixed 197-country reference set. Cont. avg
            refers to {country.continent}. Filters and the 195/197 toggle do not
            change these comparisons.
          </p>
          <p>
            Each dated figure shows its reporting year. GDP is nominal, in
            current US dollars; total area includes inland water. Years can
            differ. A dash means a comparable figure is unavailable.
          </p>
          <p>
            Top cities follow GeoNames population figures; city and metropolitan
            boundaries vary. City-states appear once. Attractions are editorial
            highlights.
          </p>
          <div className="country-reference-source-links">
            <span>Sources</span>
            {sourceIds.map((id) => (
              <a
                key={id}
                href={reference.sources[id].url}
                target="_blank"
                rel="noreferrer"
              >
                {reference.sources[id].label}
              </a>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}

export default memo(function CountryReferenceOverview({
  code,
}: {
  code: string;
}) {
  const country = reference.byCode.get(code);
  if (!country) return null;
  return (
    <>
      <section
        className="country-reference-section"
        aria-label="Country reference statistics"
      >
        <div className="country-reference-section-heading">
          <span>In perspective</span>
          <ReferenceExplanation code={code} />
        </div>
        <dl className="country-reference-metrics">
          {COUNTRY_METRICS.map((metric) => (
            <CountryMetricColumn key={metric} code={code} metric={metric} />
          ))}
        </dl>
      </section>
      <section className="country-highlights" aria-label="Country highlights">
        <div>
          <h2>Quick facts</h2>
          <ul>
            {country.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Top cities</h2>
          <ol>
            {country.cities.map((city) => (
              <li key={city}>{city}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Attractions</h2>
          <ol>
            {country.attractions.map((attraction) => (
              <li key={attraction.name}>{attraction.name}</li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
});
