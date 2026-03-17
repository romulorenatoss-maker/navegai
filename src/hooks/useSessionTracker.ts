import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks user session: inserts a row on login, updates on logout/idle.
 * Uses a ref + localStorage to prevent duplicate session rows on re-renders.
 */
export function useSessionTracker(userId: string | null, profileId: string | null) {
  const sessionRowId = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!userId || initialized.current) return;
    initialized.current = true;

    const startSession = async () => {
      // Close any orphaned sessions for this user first
      await (supabase as any)
        .from("sessoes_usuario")
        .update({
          logout_at: new Date().toISOString(),
          logout_reason: "orfao_fechado",
          duracao_segundos: 0,
        })
        .eq("user_id", userId)
        .is("logout_at", null);

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
        // Store in sessionStorage so beforeunload can reference it
        try { sessionStorage.setItem("__session_row_id", data.id); } catch {}
      }
    };

    startSession();

    const handleBeforeUnload = () => {
      const rowId = sessionRowId.current || sessionStorage.getItem("__session_row_id");
      if (!rowId) return;

      const now = new Date().toISOString();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/sessoes_usuario?id=eq.${rowId}`;
      const payload = JSON.stringify({
        logout_at: now,
        logout_reason: "tab_closed",
      });

      // sendBeacon requires auth headers via URL params for Supabase REST
      const headers = {
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        "Prefer": "return=minimal",
      };

      // Use fetch with keepalive instead of sendBeacon for proper headers
      try {
        fetch(url, {
          method: "PATCH",
          headers,
          body: payload,
          keepalive: true,
        });
      } catch {
        // Fallback: sendBeacon won't have auth but at least tries
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [userId, profileId]);

  const endSession = useCallback(async (reason: string) => {
    const rowId = sessionRowId.current;
    if (!rowId) return;

    const now = new Date();

    // Get the login_at to calculate duration
    const { data: sessionData } = await (supabase as any)
      .from("sessoes_usuario")
      .select("login_at")
      .eq("id", rowId)
      .single();

    const loginAt = sessionData?.login_at ? new Date(sessionData.login_at) : null;
    const duracao = loginAt ? Math.round((now.getTime() - loginAt.getTime()) / 1000) : null;

    await (supabase as any)
      .from("sessoes_usuario")
      .update({
        logout_at: now.toISOString(),
        logout_reason: reason,
        duracao_segundos: duracao,
      })
      .eq("id", rowId);

    sessionRowId.current = null;
    try { sessionStorage.removeItem("__session_row_id"); } catch {}
  }, []);

  return { endSession };
}
