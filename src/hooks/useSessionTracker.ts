import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks user session: inserts a row on login, updates on logout/idle.
 * Returns the current session row id so it can be updated on logout.
 */
export function useSessionTracker(userId: string | null, profileId: string | null) {
  const sessionRowId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const startSession = async () => {
      const { data, error } = await (supabase as any)
        .from("sessoes_usuario")
        .insert({
          user_id: userId,
          profile_id: profileId,
          login_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (!error && data) {
        sessionRowId.current = data.id;
      }
    };

    startSession();

    const endSession = async (reason = "manual") => {
      if (!sessionRowId.current) return;
      const now = new Date().toISOString();
      await (supabase as any)
        .from("sessoes_usuario")
        .update({
          logout_at: now,
          logout_reason: reason,
        })
        .eq("id", sessionRowId.current);
      sessionRowId.current = null;
    };

    const handleBeforeUnload = () => {
      if (!sessionRowId.current) return;
      const payload = JSON.stringify({
        logout_at: new Date().toISOString(),
        logout_reason: "tab_closed",
      });
      // Use sendBeacon for reliable delivery on tab close
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/sessoes_usuario?id=eq.${sessionRowId.current}`;
      navigator.sendBeacon(
        url,
        new Blob([payload], { type: "application/json" })
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      endSession("navigation");
    };
  }, [userId, profileId]);

  return {
    endSession: async (reason: string) => {
      if (!sessionRowId.current) return;
      await (supabase as any)
        .from("sessoes_usuario")
        .update({
          logout_at: new Date().toISOString(),
          logout_reason: reason,
        })
        .eq("id", sessionRowId.current);
      sessionRowId.current = null;
    },
  };
}
