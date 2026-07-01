import { useEffect, useState } from "react";
import { liveWebSocketUrl } from "../api/client";
import type { ColmapLivePly } from "../types";

type LivePlyEvent = {
  type: "colmap-live-ply";
  projectId: string;
  livePly: ColmapLivePly;
};

export function useColmapLivePlySocket(projectId: string | null) {
  const [livePly, setLivePly] = useState<ColmapLivePly | null>(null);

  useEffect(() => {
    setLivePly(null);

    if (!projectId) {
      return undefined;
    }

    let reconnectTimer = 0;
    let shouldReconnect = true;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(liveWebSocketUrl(projectId));

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as LivePlyEvent;

          if (payload.type === "colmap-live-ply" && payload.projectId === projectId) {
            setLivePly(payload.livePly);
          }
        } catch {
          // Ignore unrelated websocket frames.
        }
      };

      socket.onclose = () => {
        if (shouldReconnect) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      shouldReconnect = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [projectId]);

  return livePly;
}
