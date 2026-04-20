import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTabLeader } from "@/hooks/useTabLeader";

/**
 * Centralized realtime subscription for operational assignments.
 * Same architecture as useLeadsRealtime:
 * - Leader tab maintains Supabase Realtime channel
 * - Followers receive invalidations via BroadcastChannel
 * - Debounced to prevent query storms
 */

const DEBOUNCE_MS = 2000;

const OPERATIONAL_QUERY_KEYS = [
  "operational_my_assignments",
  "operational_templates",
  "operational_field_answers",
  "operational_field_reviews",
  "operational_execution_logs",
  "operational_exec_assignments",
];

export function useOperationalRealtime() {
  const queryClient = useQueryClient();
  const { isLeader, bc } = useTabLeader("nexus-operational-realtime");
  const pendingKeys = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushInvalidations = useCallback(() => {
    const keys = Array.from(pendingKeys.current);
    pendingKeys.current.clear();
    if (keys.length === 0) return;

    keys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });

    if (bc) {
      try {
        bc.postMessage({ type: "realtime-invalidate-ops", keys });
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

  // Leader: maintain Supabase Realtime channel on operational_assignments
  useEffect(() => {
    if (!isLeader) return;

    const channel = supabase
      .channel("operational-central-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operational_assignments" },
        () => {
          scheduleInvalidation([
            "operational_my_assignments",
            "operational_exec_assignments",
            "operational_field_answers",
            "operational_execution_logs",
            "operational_contingencies_management",
          ]);
        }
      )
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
      if (event.data?.type === "realtime-invalidate-ops" && Array.isArray(event.data.keys)) {
        event.data.keys.forEach((key: string) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }
    };

    bc.addEventListener("message", handler);
    return () => bc.removeEventListener("message", handler);
  }, [isLeader, bc, queryClient]);
}
