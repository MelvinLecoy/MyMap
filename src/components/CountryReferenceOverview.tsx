import { memo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import referenceData from "../generated/country-reference.json";
import {
  continentMedianLabel,
  countryMetricContext,
  createCountryReferenceLookup,
  formatCountryValue,
  formatMetricIndex,
  type CountryMetric,
  type CountryReferenceData,
} from "../lib/country-reference";

// Prepared CSV values are bundled once. No formula, aggregation or database refresh.
const reference = createCountryReferenceLookup(
  referenceData as CountryReferenceData,
);
const labels = {
  population: "Population",
  area: "Total area",
  gdp: "GDP",
  gdpPerCapita: "GDP per capita",
};
const GDP_DISPLAY_KEY = "ciudad-mundo-country-gdp-display-v1";

function CompactValue({
  metric,
  value,
  fixedDecimals,
}: {
  metric: CountryMetric;
  value: number | null;
  fixedDecimals?: number;
}) {
  if (value === null) return <span aria-label="Not available">N/A</span>;
  const formatted = formatCountryValue(metric, value, fixedDecimals);
  return (
    <>
      {formatted.amount}
      <span className="reference-value-suffix">{formatted.suffix}</span>
    </>
  );
}

function MedianRows({
  metric,
  context,
  indices = false,
}: {
  metric: CountryMetric;
  context: ReturnType<typeof countryMetricContext>;
  indices?: boolean;
}) {
  const pairs = [
    ["World median", indices ? context.worldMedianIndex : context.worldMedian],
    [
      continentMedianLabel(context.continent),
      indices ? context.continentalMedianIndex : context.continentalMedian,
    ],
  ] as const;
  return (
    <div
      className={`country-reference-medians ${indices ? "country-reference-medians--index" : "country-reference-medians--raw"}`}
      aria-label={`${labels[metric]} ${indices ? "index" : "raw"} medians`}
    >
      {pairs.map(([label, value], i) => (
        <p
          key={label}
          title={`${i ? context.continent : "World"} median ${indices ? "index" : labels[metric].toLowerCase()} · ${metric === "gdpPerCapita" ? "calculated from" : "supplied"} workbook`}
        >
          <span>
            {i === 0 ? (
              <>
                <span className="country-median-globe">🌍</span> median
              </>
            ) : (
              label
            )}
          </span>
          <strong>
            {indices ? (
              value === null ? (
                "N/A"
              ) : (
                formatMetricIndex(value)
              )
            ) : (
              <CompactValue metric={metric} value={value} />
            )}
          </strong>
        </p>
      ))}
    </div>
  );
}

function CountryMetricColumn({
  code,
  metric,
  onToggleGdp,
}: {
  code: string;
  metric: CountryMetric;
  onToggleGdp: () => void;
}) {
  const context = countryMetricContext(reference, code, metric);
  const perCapita = metric === "gdpPerCapita";
  return (
    <div className="country-reference-metric" data-metric={metric}>
      <dt>
        {metric === "gdp" || perCapita ? (
          <button
            type="button"
            className="country-metric-toggle"
            onClick={onToggleGdp}
            aria-label={perCapita ? "Show total GDP" : "Show GDP per capita"}
            aria-pressed={perCapita}
            title={
              perCapita
                ? "GDP per capita (USD) · click for total GDP"
                : "Total GDP · click for GDP per capita"
            }
          >
            {perCapita ? "GDP / cap." : "GDP"}
            <ArrowLeftRight size={10} aria-hidden="true" />
          </button>
        ) : (
          <>
            {labels[metric]}
            {metric === "area" && " (km²)"}
          </>
        )}
      </dt>
      <dd className="country-reference-metric-body">
        <div
          className="country-reference-value"
          title={
            context.value === null
              ? "Not available"
              : `${context.value.toLocaleString("en", { maximumFractionDigits: 10 })}${metric === "area" ? " km²" : metric === "gdp" ? " billion USD" : perCapita ? " USD per person" : ""}`
          }
        >
          <CompactValue
            metric={metric}
            value={context.value}
            fixedDecimals={
              metric === "population" && (code === "CN" || code === "IN")
                ? 2
                : undefined
            }
          />
        </div>
        <MedianRows metric={metric} context={context} />
        <div className="country-index-label">
          <span>Index</span>
          <strong>
            {context.index === null ? "N/A" : formatMetricIndex(context.index)}
            <small> / 100</small>
          </strong>
        </div>
        <div
          className="country-index-track"
          role={context.index === null ? undefined : "meter"}
          aria-hidden={context.index === null ? true : undefined}
          aria-label={`${labels[metric]} index`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={context.index ?? undefined}
          aria-valuetext={
            context.index === null
              ? "Not available"
              : `${formatMetricIndex(context.index)} out of 100`
          }
        >
          <span style={{ width: `${context.index ?? 0}%` }} />
        </div>
        <MedianRows metric={metric} context={context} indices />
      </dd>
    </div>
  );
}

export default memo(function CountryReferenceOverview({
  code,
}: {
  code: string;
}) {
  const [gdpDisplay, setGdpDisplay] = useState<"gdp" | "gdpPerCapita">(() => {
    try {
      return typeof window !== "undefined" &&
        localStorage.getItem(GDP_DISPLAY_KEY) === "gdpPerCapita"
        ? "gdpPerCapita"
        : "gdp";
    } catch {
      return "gdp";
    }
  });
  const toggleGdp = () => {
    const next = gdpDisplay === "gdp" ? "gdpPerCapita" : "gdp";
    setGdpDisplay(next);
    try {
      localStorage.setItem(GDP_DISPLAY_KEY, next);
    } catch {
      /* Selection still works for this profile. */
    }
  };
  const visibleMetrics = ["population", "area", gdpDisplay] as const;
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
        </div>
        <dl className="country-reference-metrics">
          {visibleMetrics.map((metric) => (
            <CountryMetricColumn
              key={metric}
              code={code}
              metric={metric}
              onToggleGdp={toggleGdp}
            />
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
