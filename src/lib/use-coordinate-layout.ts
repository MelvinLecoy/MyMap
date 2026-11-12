import { useLayoutEffect, useRef, useState } from "react";

type CoordinateLayout = "regular" | "compact" | "stacked";

export function useCoordinateLayout(cityId: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<CoordinateLayout>("regular");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!element.querySelector(".detail-coordinates")) {
      setLayout("regular");
      return;
    }
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      // Measure the original typography independently of the current layout.
      // Measure unbreakable words or the two sides of the chosen hyphen break.
      const probe = element.cloneNode(true) as HTMLDivElement;
      probe.className = "detail-identity";
      probe.setAttribute("aria-hidden", "true");
      probe.inert = true;
      Object.assign(probe.style, {
        position: "fixed",
        visibility: "hidden",
        pointerEvents: "none",
        width: "max-content",
        gridTemplateColumns: "max-content max-content",
      });
      const heading = probe.querySelector("h1")!;
      const coordinates = probe.querySelector<HTMLElement>(
        ".detail-coordinates",
      )!;
      heading.style.whiteSpace = "nowrap";
      element.after(probe);
      try {
        const hyphenParts = [...heading.querySelectorAll(".detail-name-part")];
        const range = document.createRange();
        const longestPart = Math.max(
          ...(hyphenParts.length
            ? hyphenParts.map((part) => part.getBoundingClientRect().width)
            : [...heading.textContent!.matchAll(/\S+/g)].map((word) => {
                range.setStart(heading.firstChild!, word.index!);
                range.setEnd(heading.firstChild!, word.index! + word[0].length);
                return range.getBoundingClientRect().width;
              })),
        );
        const fits = () =>
          longestPart +
            coordinates.getBoundingClientRect().width +
            parseFloat(getComputedStyle(probe).columnGap) <=
          element.clientWidth;
        let next: CoordinateLayout = "regular";
        if (!fits()) {
          probe.classList.add("detail-identity--compact");
          // Keep whole words and readable type at very narrow panel widths.
          next = fits() ? "compact" : "stacked";
        }
        setLayout((previous) => (previous === next ? previous : next));
      } finally {
        probe.remove();
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [cityId]);

  return { ref, layout };
}
