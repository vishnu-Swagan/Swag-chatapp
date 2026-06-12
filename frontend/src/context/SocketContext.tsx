import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { wsUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";

type Listener = (msg: any) => void;

export type IncomingCall = {
  from: { id: string; username: string };
  video: boolean;
};

type SocketContextType = {
  connected: boolean;
  send: (obj: any) => void;
  subscribe: (fn: Listener) => () => void;
  incomingCall: IncomingCall | null;
  clearIncomingCall: () => void;
};

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const listeners = useRef<Set<Listener>>(new Set());
  const [connected, setConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const shouldRun = !!user?.verified;

  useEffect(() => {
    if (!shouldRun) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
        }, 25000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === "call:request") {
            setIncomingCall({ from: msg.from, video: !!msg.video });
          }
          if (msg.type === "call:end" || msg.type === "call:reject") {
            setIncomingCall((prev) =>
              prev && prev.from.id === msg.from?.id ? null : prev,
            );
          }
          listeners.current.forEach((l) => l(msg));
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        clearInterval(pingTimer);
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [shouldRun]);

  const send = useCallback((obj: any) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const clearIncomingCall = useCallback(() => setIncomingCall(null), []);

  return (
    <SocketContext.Provider
      value={{ connected, send, subscribe, incomingCall, clearIncomingCall }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
