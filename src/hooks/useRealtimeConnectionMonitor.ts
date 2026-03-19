import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Monitors the Supabase Realtime WebSocket connection.
 * If the connection drops, it automatically reconnects all channels.
 * Coordinates with tab leader election — only the active leader
 * should have channels, but reconnect logic applies to any tab
 * that has active channels.
 */
export function useRealtimeConnectionMonitor() {
  const reconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnectingRef = useRef(false);

  useEffect(() => {
    const checkAndReconnect = async () => {
      if (isReconnectingRef.current) return;

      const channels = supabase.getChannels();
      if (channels.length === 0) return; // No channels = nothing to monitor

      const hasDisconnected = channels.some(
        (ch) => ch.state === "closed" || ch.state === "errored"
      );

      if (hasDisconnected) {
        isReconnectingRef.current = true;
        console.warn("[Realtime Monitor] Detected disconnected channels, reconnecting...");

        for (const ch of channels) {
          if (ch.state === "closed" || ch.state === "errored") {
            try {
              ch.subscribe();
            } catch (e) {
              console.error("[Realtime Monitor] Failed to resubscribe channel:", e);
            }
          }
        }

        // If all channels are still down, force full reconnect
        setTimeout(() => {
          const stillDown = supabase.getChannels().some(
            (ch) => ch.state === "closed" || ch.state === "errored"
          );
          if (stillDown) {
            console.warn("[Realtime Monitor] Channels still down, forcing full reconnect...");
            supabase.realtime.disconnect();
            supabase.realtime.connect();
          }
          isReconnectingRef.current = false;
        }, 5000);
      }
    };

    // Reconnect when browser comes back online
    const handleOnline = () => {
      console.info("[Realtime Monitor] Browser back online, reconnecting realtime...");
      supabase.realtime.disconnect();
      setTimeout(() => {
        supabase.realtime.connect();
      }, 1000);
    };

    // Reconnect when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAndReconnect();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Poll every 30s to catch silent disconnections
    reconnectTimerRef.current = setInterval(checkAndReconnect, 30_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    };
  }, []);
}
