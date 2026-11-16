import {
  normalizeCollectionInputs,
  verifyConciseInputs,
} from "./collection-inputs";

if (process.argv.includes("--write")) {
  await normalizeCollectionInputs();
  console.log(
    "Normalized source fields; every published business value is unchanged.",
  );
} else {
  verifyConciseInputs();
  console.log("Verified concise canonical CSV fields.");
}
