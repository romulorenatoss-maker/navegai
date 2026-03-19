import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTabLeader } from "./useTabLeader";

/**
 * Centralized realtime subscription for ALL lead-related tables.
 * - Only the leader tab maintains the Supabase Realtime WebSocket channel.
 * - Leader relays invalidation events to follower tabs via BroadcastChannel.
 * - Debounced (3s) to prevent query storms from rapid DB changes.
 * - Supports partial invalidation based on which table changed.
 *
 * Usage: call once in AppLayout (not per page).
 */

const DEBOUNCE_MS = 3000;

const LEAD_QUERY_KEYS = [
  "fila-leads",
  "fila-tarefas-leads",
  "fila-interacoes",
  "fila-contatos",
  "leads-com-agendamento",
  "leads-list",
  "leads-captura",
  "all-lead-contatos",
  "all-lead-interacoes",
  "all-lead-transfers",
  "captura-contatos",
  "captura-interacoes",
];

type TableName = "leads" | "lead_contatos" | "lead_interacoes" | "lead_tarefas_contato" | "lead_historico";

// Maps each table to which query keys it should invalidate
const TABLE_KEY_MAP: Record<TableName, string[]> = {
  leads: ["fila-leads", "leads-list", "leads-captura", "leads-com-agendamento"],
  lead_contatos: ["all-lead-contatos", "captura-contatos", "fila-contatos"],
  lead_interacoes: ["all-lead-interacoes", "captura-interacoes", "fila-interacoes"],
  lead_tarefas_contato: ["fila-tarefas-leads", "leads-list"],
  lead_historico: ["all-lead-transfers"],
};

export function useLeadsRealtime() {
  const queryClient = useQueryClient();
  const { isLeader, bc } = useTabLeader("nexus-leads-realtime");
  const pendingKeys = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushInvalidations = useCallback(() => {
    const keys = Array.from(pendingKeys.current);
    pendingKeys.current.clear();
    if (keys.length === 0) return;

    // Invalidate locally
    keys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });

    // Relay to follower tabs
    if (bc) {
      try {
        bc.postMessage({ type: "realtime-invalidate", keys });
      } catch {
        // Channel may be closed
      }
    }
  }, [queryClient, bc]);

  const scheduleInvalidation = useCallback(
    (tableKeys: string[]) => {
      tableKeys.forEach((k) => pendingKeys.current.add(k));
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(flushInvalidations, DEBOUNCE_MS);
    },
    [flushInvalidations]
  );

  // Leader: maintain Supabase Realtime channel
  useEffect(() => {
    if (!isLeader) return;

    const handleChange = (table: TableName) => () => {
      const keys = TABLE_KEY_MAP[table] || [];
      scheduleInvalidation(keys);
    };

    const channel = supabase
      .channel("leads-central-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, handleChange("leads"))
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_contatos" }, handleChange("lead_contatos"))
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_interacoes" }, handleChange("lead_interacoes"))
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_tarefas_contato" }, handleChange("lead_tarefas_contato"))
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_historico" }, handleChange("lead_historico"))
      .subscribe();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [isLeader, scheduleInvalidation]);

  // Follower: listen for invalidation messages from leader
  useEffect(() => {
    if (isLeader || !bc) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "realtime-invalidate" && Array.isArray(event.data.keys)) {
        event.data.keys.forEach((key: string) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }
    };

    bc.addEventListener("message", handler);
    return () => bc.removeEventListener("message", handler);
  }, [isLeader, bc, queryClient]);
}
