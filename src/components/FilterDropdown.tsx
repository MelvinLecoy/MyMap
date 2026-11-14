import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
  shortLabel?: string;
  color?: string;
}

const OPEN_FILTER_EVENT = "atlas:collection-filter-open";

function searchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

export default function FilterDropdown({
  label,
  value,
  onChange,
  options,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  icon?: LucideIcon;
}) {
  const id = useId();
  const listId = `${id}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex] ?? options[0];

  function close(restoreFocus = false) {
    setOpen(false);
    typeahead.current = { text: "", time: 0 };
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function show(index = Math.max(0, selectedIndex)) {
    if (!options.length) return;
    document.dispatchEvent(new CustomEvent(OPEN_FILTER_EVENT, { detail: id }));
    setPosition(null);
    setActiveIndex(index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close(true);
  }

  useEffect(() => {
    if (!options.length) setOpen(false);
    setActiveIndex((index) => Math.min(index, Math.max(0, options.length - 1)));
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;

    function placeMenu() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (anchor.bottom < 0 || anchor.top > viewportHeight) {
        setOpen(false);
        return;
      }
      const width = Math.min(Math.max(anchor.width, 170), viewportWidth - 16);
      const desiredHeight = Math.min(280, options.length * 28 + 10);
      const below = viewportHeight - anchor.bottom - 13;
      const above = anchor.top - 13;
      const opensBelow =
        below >= Math.min(desiredHeight, 180) || below >= above;
      const maxHeight = Math.max(0, Math.min(280, opensBelow ? below : above));
      const height = Math.min(desiredHeight, maxHeight);
      setPosition({
        width,
        maxHeight,
        left: Math.max(8, Math.min(anchor.left, viewportWidth - width - 8)),
        top: opensBelow
          ? anchor.bottom + 5
          : Math.max(8, anchor.top - height - 5),
      });
    }

    function handleScroll(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target))
        return;
      placeMenu();
    }

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function outsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      )
        close();
    }
    function anotherFilter(event: Event) {
      if ((event as CustomEvent<string>).detail !== id) close();
    }
    document.addEventListener("pointerdown", outsidePointer, true);
    document.addEventListener(OPEN_FILTER_EVENT, anotherFilter);
    return () => {
      document.removeEventListener("pointerdown", outsidePointer, true);
      document.removeEventListener(OPEN_FILTER_EVENT, anotherFilter);
    };
  }, [open, id]);

  useLayoutEffect(() => {
    if (!open || !position) return;
    const list = menu.current;
    const option = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop + 4) list.scrollTop = Math.max(0, top - 4);
    else if (bottom > list.scrollTop + list.clientHeight - 4)
      list.scrollTop = bottom - list.clientHeight + 4;
  }, [open, activeIndex, position]);

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open)
        show(
          selectedIndex >= 0
            ? selectedIndex
            : event.key === "ArrowUp"
              ? options.length - 1
              : 0,
        );
      else
        setActiveIndex(
          (index) =>
            (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length,
        );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : options.length - 1;
      if (!open) show(index);
      else setActiveIndex(index);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else show();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      if (open) close();
    } else if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      const now = Date.now();
      const character = searchText(event.key);
      const previous =
        now - typeahead.current.time < 700 ? typeahead.current.text : "";
      const text = previous + character;
      typeahead.current = { text, time: now };
      const search = [...text].every((letter) => letter === character)
        ? character
        : text;
      const start = open ? activeIndex : Math.max(0, selectedIndex);
      const first = search.length === 1 ? start + 1 : start;
      let match = -1;
      for (let offset = 0; offset < options.length; offset++) {
        const index = (first + offset) % options.length;
        if (searchText(options[index].label).startsWith(search)) {
          match = index;
          break;
        }
      }
      if (!open) show(match >= 0 ? match : Math.max(0, selectedIndex));
      else if (match >= 0) setActiveIndex(match);
    }
  }

  return (
    <div
      className="collection-filter"
      data-active={value !== options[0]?.value}
    >
      <button
        ref={trigger}
        className="collection-filter-trigger"
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={!options.length}
        onClick={() => (open ? close() : show())}
        onKeyDown={handleKey}
        onBlur={(event) => {
          if (!menu.current?.contains(event.relatedTarget)) close();
        }}
      >
        {Icon && <Icon size={11} aria-hidden="true" />}
        <span
          className="collection-filter-value"
          style={{ color: selected?.color }}
        >
          {selected?.shortLabel ?? selected?.label ?? label}
        </span>
        <ChevronDown
          className="collection-filter-chevron"
          size={10}
          aria-hidden="true"
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={listId}
            role="listbox"
            aria-label={label}
            className="collection-filter-menu"
            style={position ?? { visibility: "hidden" }}
            onPointerDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('[role="option"]')
              )
                event.preventDefault();
            }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={activeIndex === index}
                className="collection-filter-option"
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span
                  className="collection-filter-option-label"
                  style={{ color: option.color }}
                >
                  {option.label}
                </span>
                {option.value === value && (
                  <Check size={12} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
