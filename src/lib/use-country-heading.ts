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
      // Keep whole words and the trailing flag together beside the rank.
      heading.style.removeProperty("font-size");
      const size = parseFloat(getComputedStyle(heading).fontSize);
      const available = heading.getBoundingClientRect().width;
      if (available <= 0) return;
      let scale = 1;
      for (const word of heading.querySelectorAll(".country-name-word")) {
        const width = word.getBoundingClientRect().width;
        const ending = word.parentElement;
        const reserved = ending?.classList.contains("country-name-ending")
          ? ending.getBoundingClientRect().width - width
          : 0;
        if (width > 0)
          scale = Math.min(
            scale,
            Math.max(1, available - reserved - 1) / width,
          );
      }
      if (scale < 1)
        heading.style.fontSize = `${Math.floor(size * scale * 100) / 100}px`;
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
