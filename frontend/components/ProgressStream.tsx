"use client";

import { useEffect, useRef } from "react";

interface ProgressEvent {
  node: string;
  message: string;
  detail?: string;
  timestamp: number;
}

interface Props {
  events: ProgressEvent[];
  loading: boolean;
}

const NODE_META: Record<string, { color: string; bg: string; label: string }> = {
  planner:     { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", label: "Plan" },
  search_embed:{ color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  label: "Search" },
  synthesizer: { color: "#34d399", bg: "rgba(52,211,153,0.1)",  label: "Synthesize" },
  increment:   { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  label: "Refine" },
};

const STAGE_ORDER = ["planner", "search_embed", "synthesizer", "increment"];

export default function ProgressStream({ events, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (events.length === 0 && !loading) return null;

  // Determine which stage we're currently in
  const activeNode = events.length > 0 ? events[events.length - 1].node : "";
  const seenNodes = new Set(events.map((e) => e.node));

  return (
    <div style={s.wrapper}>
      {/* Stage pipeline */}
      <div style={s.pipeline}>
        {STAGE_ORDER.map((node, i) => {
          const meta = NODE_META[node];
          const isDone = seenNodes.has(node) && activeNode !== node;
          const isActive = activeNode === node;
          const isPending = !seenNodes.has(node);
          return (
            <div key={node} style={s.stageItem}>
              <div
                style={{
                  ...s.stageDot,
                  background: isDone
                    ? meta.color
                    : isActive
                    ? "transparent"
                    : "#2d2d3d",
                  border: isActive ? `2px solid ${meta.color}` : "2px solid transparent",
                  boxShadow: isActive ? `0 0 8px ${meta.color}` : "none",
                }}
              >
                {isDone ? (
                  <span style={{ color: "#0f0f1a", fontSize: 10, fontWeight: 700 }}>✓</span>
                ) : isActive ? (
                  <span style={{ ...s.spinner, borderTopColor: meta.color }} />
                ) : null}
              </div>
              <span
                style={{
                  ...s.stageLabel,
                  color: isDone ? meta.color : isActive ? meta.color : "#4b5563",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {meta.label}
              </span>
              {i < STAGE_ORDER.length - 1 && (
                <div
                  style={{
                    ...s.stageLine,
                    background: isDone ? meta.color : "#2d2d3d",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Activity log */}
      <div style={s.log}>
        {events.map((ev, i) => {
          const meta = NODE_META[ev.node] ?? { color: "#9ca3af", bg: "transparent", label: ev.node };
          const isLatest = i === events.length - 1;
          return (
            <div
              key={i}
              style={{
                ...s.logRow,
                opacity: isLatest ? 1 : 0.6,
              }}
            >
              <div style={{ ...s.logTag, color: meta.color, background: meta.bg }}>
                {meta.label}
              </div>
              <div style={s.logContent}>
                <span style={s.logMessage}>{ev.message}</span>
                {ev.detail && (
                  <span style={s.logDetail}>{ev.detail}</span>
                )}
              </div>
              {isLatest && loading && (
                <span style={{ ...s.spinnerSmall, borderTopColor: meta.color }} />
              )}
            </div>
          );
        })}
        {events.length === 0 && loading && (
          <div style={s.logRow}>
            <div style={{ ...s.logTag, color: "#6b7280", background: "transparent" }}>—</div>
            <span style={s.logMessage}>Starting research...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    maxWidth: 800,
    margin: "0 auto 40px",
    padding: "0 24px",
  },

  // Pipeline
  pipeline: {
    display: "flex",
    alignItems: "center",
    marginBottom: 16,
    padding: "16px 20px",
    background: "#1a1a2e",
    borderRadius: 12,
    border: "1px solid #2d2d3d",
    gap: 0,
  },
  stageItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stageLabel: {
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  },
  stageLine: {
    flex: 1,
    height: 1,
    marginLeft: 8,
    minWidth: 12,
  },
  spinner: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "#fff",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  } as React.CSSProperties,
  spinnerSmall: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.1)",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
    display: "inline-block",
  } as React.CSSProperties,

  // Log
  log: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "14px 16px",
    background: "#13131f",
    borderRadius: 10,
    border: "1px solid #2d2d3d",
    maxHeight: 240,
    overflowY: "auto",
  },
  logRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    transition: "opacity 0.2s",
  },
  logTag: {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 4,
    flexShrink: 0,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  logContent: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  logMessage: {
    color: "#d1d5db",
    fontSize: 13,
  },
  logDetail: {
    color: "#4b5563",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
