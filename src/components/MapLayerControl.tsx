import { useEffect, useId, useRef, useState } from "react";
import { Check, Layers } from "lucide-react";
import type { MapLayer } from "../lib/map-style";

const layers: { id: MapLayer; name: string; description: string }[] = [
  { id: "standard", name: "Standard", description: "Current map colours" },
  {
    id: "last-visit",
    name: "Last visit history",
    description: "Unvisited countries in grey",
  },
];

export default function MapLayerControl({
  value,
  onChange,
}: {
  value: MapLayer;
  onChange: (layer: MapLayer) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    container.current
      ?.querySelector<HTMLInputElement>("input:checked")
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="map-layer-control" ref={container}>
      {open && (
        <div className="map-layer-panel" id={id}>
          <fieldset>
            <legend>Map layers</legend>
            {layers.map((layer) => (
              <label
                key={layer.id}
                className="map-layer-option"
                data-selected={value === layer.id}
              >
                <input
                  type="radio"
                  name={id}
                  value={layer.id}
                  checked={value === layer.id}
                  onChange={() => onChange(layer.id)}
                />
                <span
                  className={`map-layer-preview map-layer-preview--${layer.id}`}
                  aria-hidden="true"
                />
                <span className="map-layer-label">
                  <strong>{layer.name}</strong>
                  <span>{layer.description}</span>
                </span>
                {value === layer.id && <Check size={15} aria-hidden="true" />}
              </label>
            ))}
          </fieldset>
        </div>
      )}
      <button
        type="button"
        ref={trigger}
        className="map-control-single map-layer-trigger"
        aria-label="Map layers"
        title="Map layers"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Layers size={21} aria-hidden="true" />
      </button>
    </div>
  );
}
