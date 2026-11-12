import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, LoaderCircle, Map } from "lucide-react";
import type { City } from "../lib/types";
export default function MapViewer({
  city,
  onClose,
}: {
  city: City;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  if (!city.map) return null;
  return (
    <section className="map-viewer" aria-label={`${city.name} annotated map`}>
      <header className="viewer-header">
        <button
          className="text-button viewer-back"
          ref={back}
          onClick={onClose}
        >
          <ArrowLeft size={17} />
          <span>Back to globe</span>
        </button>
        <div className="viewer-title">
          <Map size={15} />
          <span>
            {city.name}
            <small>Annotated map</small>
          </span>
        </div>
        <a
          className="viewer-external"
          href={city.map.viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google My Maps
          <ArrowUpRight size={16} />
        </a>
      </header>
      <div className="iframe-wrap">
        {!loaded && (
          <div className="viewer-loading">
            <LoaderCircle className="spin" size={25} />
            <span>Opening {city.name}</span>
            <small>
              {slow
                ? "Taking longer than expected. You can open this map directly in Google My Maps."
                : "Loading your annotated map…"}
            </small>
          </div>
        )}
        <iframe
          title={`${city.name}, ${city.country} — Google My Maps annotated map`}
          src={city.map.embedUrl}
          onLoad={() => setLoaded(true)}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="viewer-footnote">
        <span>Map content and sharing are managed by Google.</span>
        <span>
          If the map is unavailable, try opening it in Google My Maps.
        </span>
      </div>
    </section>
  );
}
