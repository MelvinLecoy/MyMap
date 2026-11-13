import { useLayoutEffect, useRef } from "react";

export function useCountryHeading(
  name: string,
  order: number | null | undefined,
) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    const heading = container?.querySelector("h1");
    if (!container || !heading) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      // Keep normal title sizing unless a complete word cannot fit beside the rank.
      heading.style.removeProperty("font-size");
      const size = parseFloat(getComputedStyle(heading).fontSize);
      const longestWord = Math.max(
        0,
        ...[...heading.querySelectorAll(".country-name-word")].map(
          (word) => word.getBoundingClientRect().width,
        ),
      );
      const available = heading.getBoundingClientRect().width;
      if (available > 0 && longestWord > available) {
        heading.style.fontSize = `${Math.floor(((size * (available - 1)) / longestWord) * 100) / 100}px`;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [name, order]);
  return ref;
}
