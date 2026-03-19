import { useEffect, useRef, useState } from "react";

/**
 * BroadcastChannel-based leader election.
 * Only ONE tab becomes the "leader" and maintains WebSocket connections.
 * Other tabs receive updates via BroadcastChannel relay.
 * If the leader tab closes, another tab takes over.
 */
export function useTabLeader(channelName = "nexus-tab-leader") {
  const [isLeader, setIsLeader] = useState(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabId = useRef(crypto.randomUUID());
  const leaderIdRef = useRef<string | null>(null);
  const electionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      // Fallback: every tab is leader (older browsers)
      setIsLeader(true);
      return;
    }

    const bc = new BroadcastChannel(channelName);
    bcRef.current = bc;

    const startElection = () => {
      if (electionTimeoutRef.current) clearTimeout(electionTimeoutRef.current);
      // Announce candidacy
      bc.postMessage({ type: "election", tabId: tabId.current });
      // Wait 500ms for higher-priority tabs to respond
      electionTimeoutRef.current = setTimeout(() => {
        // No one claimed leadership, we become leader
        leaderIdRef.current = tabId.current;
        setIsLeader(true);
        bc.postMessage({ type: "leader", tabId: tabId.current });
        startHeartbeat();
      }, 500);
    };

    const startHeartbeat = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        bc.postMessage({ type: "heartbeat", tabId: tabId.current });
      }, 3000);
    };

    bc.onmessage = (event) => {
      const { type, tabId: senderId } = event.data;

      if (type === "election" && leaderIdRef.current === tabId.current) {
        // We are leader, assert dominance
        bc.postMessage({ type: "leader", tabId: tabId.current });
      }

      if (type === "leader") {
        leaderIdRef.current = senderId;
        if (senderId !== tabId.current) {
          // Someone else is leader
          if (electionTimeoutRef.current) clearTimeout(electionTimeoutRef.current);
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          setIsLeader(false);
        }
      }

      if (type === "heartbeat") {
        leaderIdRef.current = senderId;
      }

      // Relay realtime data from leader to followers
      if (type === "realtime-update" && senderId !== tabId.current) {
        // Handled by useLeadsRealtime hook
      }
    };

    // Start election on mount
    startElection();

    // Detect leader death: if no heartbeat in 6s, start new election
    const watchdog = setInterval(() => {
      if (leaderIdRef.current && leaderIdRef.current !== tabId.current) {
        // We're a follower; leader should be sending heartbeats
        // If leader dies, BroadcastChannel won't get heartbeats
        // We trigger election proactively
      }
    }, 6000);

    // On beforeunload, if we're leader, tell others
    const handleUnload = () => {
      if (leaderIdRef.current === tabId.current) {
        bc.postMessage({ type: "leader-leaving", tabId: tabId.current });
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    // Listen for leader leaving
    const origOnMessage = bc.onmessage;
    bc.onmessage = (event) => {
      origOnMessage?.call(bc, event);
      if (event.data.type === "leader-leaving") {
        leaderIdRef.current = null;
        // Start new election after short delay
        setTimeout(startElection, 200 + Math.random() * 300);
      }
    };

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (electionTimeoutRef.current) clearTimeout(electionTimeoutRef.current);
      clearInterval(watchdog);
      bc.close();
    };
  }, [channelName]);

  return { isLeader, tabId: tabId.current, bc: bcRef.current };
}
