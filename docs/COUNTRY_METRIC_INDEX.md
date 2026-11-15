# Country Metric Index — Formula & Calculation Rules

This document specifies the **0–100 nonlinear index** used by Ciudad Mundo for three country/territory metrics:

- **GDP:** nominal GDP, in a consistent currency and units within the comparison pool
- **Population:** total population
- **Total Area:** total surface area (land **plus** inland water), in km²

All three indices use the **same formula and parameters**. The result is a **relative, visually compressed size index**, **not** a percentage of the largest country's raw value.

## Formula

For an entity with metric value \(x\):

\[
\boxed{\displaystyle
I(x,r,N)=100\left[
0.58\left(\frac{x}{x_{\max}}\right)^{0.26}
+0.42\left(\frac{N-r}{N-1}\right)^{1.75}
\right]
}
\]

| Symbol | Meaning |
|---|---|
| \(x\) | Entity's raw metric value (GDP, population, or total area) |
| \(x_{\max}\) | Largest **valid** raw value in the same metric's comparison pool |
| \(r\) | Rank within that pool, sorted by raw value descending (largest = rank 1) |
| \(N\) | Number of entities with valid values for that metric **in that pool** |
| \(I\) | Index score on a 0–100 scale |

### Fixed parameters

| Parameter | Value | Role |
|---|---:|---|
| Magnitude weight, \(w\) | **0.58** | Weight on relative raw size |
| Magnitude exponent, \(\alpha\) | **0.26** | Compresses large gaps in raw values |
| Rank weight, \(1-w\) | **0.42** | Weight on position in the distribution |
| Rank exponent, \(\beta\) | **1.75** | Shapes how quickly the ranking contribution falls |

**Interpretation:** The magnitude component rewards actual scale; the rank component spreads scores across the distribution. Thus an index of 70 **does not** mean 70% of the largest entity's GDP, population, or area.

## Comparison pools and category rules

The workbook uses **two independent ranking pools**:

1. **Countries — 197 entries**: the 195-country base plus **Taiwan and Kosovo**. Both Taiwan and Kosovo participate fully in country rankings. Their category labels are `197`; the base entries have category `195`.
2. **Territories — 53 entries**: separate rankings, denominators, and index maxima; category `Territory`.

For each metric, calculate ranks, \(N\), and \(x_{\max}\) **within the appropriate pool only**. A territory's score is relative to other territories, not countries. Therefore a 100 for the highest-GDP territory is **not directly equivalent** to a 100 for the highest-GDP country.

**No parent-country double counting:** Greenland and French Guiana are listed as territories rather than added to Denmark's or France's territorial totals for the area metric. Use harmonized raw data that follow these geographic boundaries.

### Missing data and ranking

- Treat missing, unavailable, or unreliable raw metrics as **`N/A`**. Do not replace missing values with 0.
- Exclude `N/A` entries from \(N\), the maximum, and the metric's ranking; their index is `N/A`.
- The 197-country pool describes the eligible country list; **\(N\) may be smaller** for a particular metric if values are missing (e.g. GDP).
- Recompute ranks from the **raw metric values**, not from rankings copied from a data provider.
- Identical raw values receive the **same competition rank** (`1, 2, 2, 4`); use original unrounded values when determining ties.
- Zero is a valid numeric observation, distinct from missing. When the pool maximum is positive, use \(x=0\) normally in the formula.
- The formula requires \(N \ge 2\) and \(x_{\max} > 0\); otherwise return `N/A`.

## Precision and presentation

- Compute the formula at **full precision** using raw values and raw-value ranks.
- **Display the index to 1 decimal place**, e.g. `36.4`. Round only for display/export, not before sorting or aggregation.
- For global or continental medians, use **only the 197 countries**, excluding territories; compute the median of each raw metric and the median of its calculated index **separately**, excluding `N/A` values.
- The raw GDP, population, and area values need not come from the same measurement year if a country lacks a current value. However, maintain the best consistent official statistical definition available and do not mistake the resulting rankings for a strict same-year comparison.

## Reference implementation (JavaScript)

```js
const INDEX_PARAMS = {
  weight: 0.58,
  magnitudeExponent: 0.26,
  rankExponent: 1.75,
};

function metricIndex(value, maxValue, rank, validCount) {
  if (
    !Number.isFinite(value) || value < 0 ||
    !Number.isFinite(maxValue) || maxValue <= 0 ||
    !Number.isInteger(rank) || rank < 1 ||
    !Number.isInteger(validCount) || validCount < 2 ||
    rank > validCount || value > maxValue
  ) return null; // display as N/A

  const { weight, magnitudeExponent, rankExponent } = INDEX_PARAMS;
  const magnitude = Math.pow(value / maxValue, magnitudeExponent);
  const distribution = Math.pow((validCount - rank) / (validCount - 1), rankExponent);

  return Math.max(0, Math.min(100,
    100 * (weight * magnitude + (1 - weight) * distribution)
  ));
}

// Run independently for each metric AND for each pool (countries vs territories).
// Exclude missing values before ranking and setting validCount / maxValue.
// Round only when displaying: score.toFixed(1).
```

## Versioning

**Index model V1**: `w = 0.58`, `alpha = 0.26`, `beta = 1.75` for **all three metrics**.

Updating raw data or recomputing ranks **does not** change the index model version. If these parameters or the mathematical formula change, record it as a **new model version**; otherwise historical scores derived using different formulas would be mixed.
