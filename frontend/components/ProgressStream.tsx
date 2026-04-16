"use client";

import { useEffect, useRef } from "react";

interface ProgressEvent {
  node: string;
  message: string;
  timestamp: number;
}

interface Props {
  events: ProgressEvent[];
}

const NODE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  planner: { icon: "◆", color: "#a78bfa", label: "Planner" },
  search_embed: { icon: "◉", color: "#60a5fa", label: "Search & Embed" },
  synthesizer: { icon: "◈", color: "#34d399", label: "Synthesizer" },
  increment: { icon: "↻", color: "#f59e0b", label: "Iteration" },
};

export default function ProgressStream({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Research in progress</h2>
      <div style={styles.list}>
        {events.map((ev, i) => {
          const config = NODE_CONFIG[ev.node] ?? { icon: "•", color: "#9ca3af", label: ev.node };
          return (
            <div
              key={i}
              style={{
                ...styles.item,
                animation: "fadeIn 0.3s ease forwards",
                animationDelay: `${i * 0.05}s`,
                opacity: 0,
              }}
            >
              <span style={{ ...styles.icon, color: config.color }}>{config.icon}</span>
              <div>
                <span style={{ ...styles.nodeName, color: config.color }}>{config.label}</span>
                <span style={styles.message}>{ev.message}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto 40px",
    padding: "0 24px",
  },
  heading: {
    fontSize: 14,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 16,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "20px",
    background: "#1a1a2e",
    borderRadius: 12,
    border: "1px solid #2d2d3d",
    maxHeight: 300,
    overflowY: "auto",
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  icon: {
    fontSize: 18,
    lineHeight: 1.4,
    flexShrink: 0,
  },
  nodeName: {
    fontWeight: 600,
    fontSize: 13,
    marginRight: 8,
  },
  message: {
    color: "#9ca3af",
    fontSize: 13,
  },
};
