import { useEffect, useRef, useCallback } from "react";

const IDLE_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click", "input", "change"];

export function useIdleTimeout(onIdle: () => void, timeoutMs = 30 * 60 * 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Don't trigger idle if user has focus on an input/textarea/select
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.getAttribute("contenteditable") === "true")) {
        // Re-schedule instead of firing
        resetTimer();
        return;
      }
      onIdle();
    }, timeoutMs);
  }, [onIdle, timeoutMs]);

  useEffect(() => {
    IDLE_EVENTS.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      IDLE_EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);
}
