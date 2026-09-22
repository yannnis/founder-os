"use client";

import { useEffect, useRef } from "react";

export function NewsletterFrame({ src }: { src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "ss-path" || typeof event.data.path !== "string") return;
      const path = event.data.path === "/" ? "/newsletter" : `/newsletter${event.data.path}`;
      if (window.location.pathname !== path) window.history.replaceState(null, "", path);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frame}
      title="Newsletter"
      src={src}
      className="fixed inset-0 z-50 h-full w-full border-0 bg-white"
    />
  );
}
