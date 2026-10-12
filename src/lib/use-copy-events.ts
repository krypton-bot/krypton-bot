"use client";

import { useEffect, useRef, useState } from "react";
import type { CopyEvent } from "@/lib/api-client";

const MAX = 100;

/** Recent copy-bot events plus live SSE pushes (EventSource reconnects on its own). `onEvent` fires for live pushes only. */
export function useCopyEvents(onEvent?: (e: CopyEvent) => void) {
  const [events, setEvents] = useState<CopyEvent[]>([]);
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  });

  useEffect(() => {
    let closed = false;
    fetch("/api/copy/events")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d: { events: CopyEvent[] }) => {
        if (closed) return;
        setEvents((cur) => {
          const seen = new Set(cur.map((e) => e.id));
          return [...cur, ...d.events.filter((e) => !seen.has(e.id))].sort((a, b) => b.id - a.id).slice(0, MAX);
        });
      })
      .catch(() => {});
    const es = new EventSource("/api/copy/events/stream");
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as CopyEvent;
      setEvents((cur) => (cur.some((x) => x.id === e.id) ? cur : [e, ...cur].slice(0, MAX)));
      cb.current?.(e);
    };
    return () => {
      closed = true;
      es.close();
    };
  }, []);

  return events;
}
