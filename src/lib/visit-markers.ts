import type { TimelineStay } from "./visit-timeline";

export interface VisitMarkerContext {
  kind: "country" | "city";
  countryCode?: string | null;
}
export type StayMarker = "filled" | "hollow" | "diamond";

/** Presentation only: endpoint shapes never change recorded dates or durations. */
export function stayMarkers(
  stay: Pick<TimelineStay, "single" | "days" | "exceptional">,
  { kind, countryCode }: VisitMarkerContext,
): StayMarker[] {
  if (!stay.exceptional) return stay.single ? ["filled"] : ["filled", "filled"];
  if (kind === "city" && countryCode === "SG" && stay.days === 1)
    return ["diamond"];
  if (stay.single) return ["hollow"];
  if (kind === "country") {
    if (countryCode === "BA" || countryCode === "DO")
      return ["hollow", "filled"];
    if (["CZ", "SG", "ID"].includes(countryCode ?? ""))
      return ["hollow", "hollow"];
  }
  return ["filled", "hollow"];
}
