import { useEffect, type RefObject } from "react";

/**
 * Custom hook to detect clicks outside of a specified element.
 * Useful for closing dropdowns, popovers, and menus.
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    function listener(event: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) {
        return;
      }
      handler(event);
    }

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler, enabled]);
}
