"use client";

import { useEffect, useRef, useState } from "react";

interface ProgressEvent {
  node: string;
  message: string;
  detail?: string;
  timestamp: number;
}

interface Props {
  events: ProgressEvent[];
  loading: boolean;
  companyName?: string;
}

const NODE_META: Record<string, { color: string; label: string }> = {
  planner:      { color: "#a78bfa", label: "Plan" },
  search_embed: { color: "#60a5fa", label: "Search" },
  synthesizer:  { color: "#34d399", label: "Synthesize" },
  increment:    { color: "#f59e0b", label: "Refine" },
};

const STAGE_ORDER = ["planner", "search_embed", "synthesizer", "increment"];

// Fixed blip positions inside the radar circle (as % of diameter, offset from center)
const BLIP_POSITIONS = [
  { x: 28, y: 22 }, { x: 62, y: 18 }, { x: 72, y: 55 },
  { x: 38, y: 68 }, { x: 18, y: 52 }, { x: 55, y: 38 },
  { x: 82, y: 32 }, { x: 48, y: 80 }, { x: 22, y: 35 },
  { x: 68, y: 72 }, { x: 42, y: 28 }, { x: 78, y: 60 },
];

function Radar({ active, blipCount }: { active: boolean; blipCount: number }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Static SVG: rings + crosshairs */}
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0d1a10" />
            <stop offset="100%" stopColor="#060a07" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="url(#radarBg)" stroke="#1a3a1a" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={r * 0.66} fill="none" stroke="#0f2a12" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="#0f2a12" strokeWidth={1} />
        <line x1={cx} y1={6} x2={cx} y2={size - 6} stroke="#0f2a12" strokeWidth={0.8} />
        <line x1={6} y1={cy} x2={size - 6} y2={cy} stroke="#0f2a12" strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={3} fill="#00cc66" />
        {/* Blips */}
        {BLIP_POSITIONS.slice(0, blipCount).map((pos, i) => (
          <g key={i}>
            <circle
              cx={(pos.x / 100) * size}
              cy={(pos.y / 100) * size}
              r={3}
              fill="#00cc66"
              style={{ animation: `blipPulse 2s ${(i * 0.3) % 2}s ease-in-out infinite` }}
            />
            <circle
              cx={(pos.x / 100) * size}
              cy={(pos.y / 100) * size}
              r={6}
              fill="none"
              stroke="#00cc66"
              strokeWidth={0.8}
              opacity={0.3}
              style={{ animation: `blipRing 2s ${(i * 0.3) % 2}s ease-out infinite` }}
            />
          </g>
        ))}
      </svg>

      {/* Sweep: conic gradient layer */}
      {active && (
        <div
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(0,204,102,0) 0deg, rgba(0,204,102,0.04) 200deg, rgba(0,204,102,0.18) 320deg, rgba(0,204,102,0.35) 355deg, rgba(0,204,102,0) 360deg)",
            animation: "radarSweep 4s linear infinite",
            zIndex: 2,
          }}
        />
      )}

      {/* Sweep line */}
      {active && (
        <div
          style={{
            position: "absolute",
            width: 2,
            height: r,
            top: 6,
            left: "50%",
            marginLeft: -1,
            transformOrigin: "bottom center",
            background: "linear-gradient(to top, rgba(0,204,102,0.9), rgba(0,204,102,0))",
            animation: "radarSweep 4s linear infinite",
            zIndex: 3,
            borderRadius: 2,
          }}
        />
      )}

      {/* Outer glow ring */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          boxShadow: active
            ? "0 0 32px rgba(0,204,102,0.2), inset 0 0 16px rgba(0,204,102,0.06)"
            : "none",
          zIndex: 4,
          pointerEvents: "none",
          transition: "box-shadow 0.5s",
        }}
      />
    </div>
  );
}

export default function ProgressStream({ events, loading, companyName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [blipCount, setBlipCount] = useState(0);

  // Add a blip every time we get a new search result
  useEffect(() => {
    const searchEvents = events.filter((e) => e.node === "search_embed" && e.message.includes("Done"));
    if (searchEvents.length > 0) {
      setBlipCount((n) => Math.min(n + 4, BLIP_POSITIONS.length));
    }
  }, [events]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (events.length === 0 && !loading) return null;

  const seenNodes = new Set(events.map((e) => e.node));
  const activeNode = events.length > 0 ? events[events.length - 1].node : "";
  const latestEvent = events[events.length - 1];

  return (
    <div style={s.wrapper}>
      <style>{`
        @keyframes radarSweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes blipPulse {
          0%, 100% { opacity: 0.4; r: 3; }
          50%       { opacity: 1;   r: 4; }
        }
        @keyframes blipRing {
          0%   { r: 5;  opacity: 0.5; }
          100% { r: 14; opacity: 0;   }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>

      <style>{`
        @media (max-width: 480px) {
          .ps-card { flex-direction: column !important; align-items: center !important; padding: 16px !important; }
          .ps-radar { display: none !important; }
        }
      `}</style>

      {/* Main card */}
      <div style={s.card} className="ps-card">
        {/* Left: Radar */}
        <div style={s.radarCol} className="ps-radar">
          <Radar active={loading} blipCount={blipCount} />
          <div style={s.radarLabel}>
            {loading ? (
              <span style={s.scanningText}>SCANNING</span>
            ) : (
              <span style={{ ...s.scanningText, color: "#4b5563" }}>IDLE</span>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div style={s.infoCol}>
          <div style={s.company}>
            {companyName
              ? <>Researching <span style={s.companyHighlight}>{companyName}</span></>
              : "Research in progress"}
          </div>

          {/* Current status */}
          {latestEvent && (
            <div style={s.currentStatus}>
              <span
                style={{
                  ...s.statusDot,
                  background: NODE_META[latestEvent.node]?.color ?? "#9ca3af",
                  animation: loading ? "pulse 1.4s ease-in-out infinite" : "none",
                }}
              />
              <div>
                <div style={s.statusMessage}>{latestEvent.message}</div>
                {latestEvent.detail && (
                  <div style={s.statusDetail}>{latestEvent.detail}</div>
                )}
              </div>
            </div>
          )}

          {/* Stage pipeline */}
          <div style={s.pipeline}>
            {STAGE_ORDER.map((node, i) => {
              const meta = NODE_META[node];
              const isDone = seenNodes.has(node) && node !== activeNode;
              const isActive = node === activeNode && loading;
              return (
                <div key={node} style={s.stageWrap}>
                  <div style={s.stageRow}>
                    <div
                      style={{
                        ...s.stageDot,
                        background: isDone
                          ? meta.color
                          : isActive
                          ? "transparent"
                          : "#1f1f30",
                        border: isActive ? `2px solid ${meta.color}` : "2px solid transparent",
                        boxShadow: isActive ? `0 0 6px ${meta.color}88` : "none",
                      }}
                    >
                      {isDone && <span style={{ color: "#000", fontSize: 9, fontWeight: 800 }}>✓</span>}
                      {isActive && (
                        <div style={{ ...s.spinnerInner, borderTopColor: meta.color }} />
                      )}
                    </div>
                    <span style={{
                      ...s.stageLabel,
                      color: isDone || isActive ? meta.color : "#374151",
                      fontWeight: isActive ? 700 : 500,
                    }}>
                      {meta.label}
                    </span>
                  </div>
                  {i < STAGE_ORDER.length - 1 && (
                    <div style={{
                      ...s.connector,
                      background: isDone ? `${meta.color}60` : "#1f1f30",
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Event count badge */}
          <div style={s.statRow}>
            <span style={s.statBadge}>{events.length} events</span>
            {blipCount > 0 && (
              <span style={{ ...s.statBadge, color: "#34d399", borderColor: "#34d39940" }}>
                {blipCount * 3}+ signals found
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Activity log */}
      {events.length > 0 && (
        <div style={s.log}>
          {events.slice(-8).map((ev, i, arr) => {
            const meta = NODE_META[ev.node] ?? { color: "#6b7280", label: ev.node };
            const isLatest = i === arr.length - 1;
            return (
              <div
                key={i}
                style={{
                  ...s.logRow,
                  opacity: isLatest ? 1 : Math.max(0.3, 1 - (arr.length - 1 - i) * 0.15),
                  animation: isLatest ? "fadeUp 0.3s ease forwards" : "none",
                }}
              >
                <span style={{ ...s.logTag, color: meta.color }}>
                  {meta.label.toUpperCase()}
                </span>
                <span style={s.logMsg}>{ev.message}</span>
                {ev.detail && <span style={s.logDetail}>{ev.detail}</span>}
                {isLatest && loading && (
                  <div style={s.dotLoader}>
                    <span style={{ display:"inline-block", width:4, height:4, borderRadius:"50%", background:"#4b5563", animation:"dotBounce 1.2s ease-in-out infinite", animationDelay:"0s" }} />
                    <span style={{ display:"inline-block", width:4, height:4, borderRadius:"50%", background:"#4b5563", animation:"dotBounce 1.2s ease-in-out infinite", animationDelay:"0.2s" }} />
                    <span style={{ display:"inline-block", width:4, height:4, borderRadius:"50%", background:"#4b5563", animation:"dotBounce 1.2s ease-in-out infinite", animationDelay:"0.4s" }} />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
        .dot-loader span {
          display: inline-block;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: #6b7280;
          animation: dotBounce 1.2s ease-in-out infinite;
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
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  // Main card
  card: {
    display: "flex",
    gap: 28,
    padding: "24px 28px",
    background: "linear-gradient(135deg, #0f0f1e 0%, #0a120e 100%)",
    borderRadius: 16,
    border: "1px solid #1a3a1a",
    boxShadow: "0 0 40px rgba(0,204,102,0.05)",
    alignItems: "center",
  },

  // Radar col
  radarCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  radarLabel: {
    fontSize: 10,
    letterSpacing: "0.15em",
  },
  scanningText: {
    color: "#00cc66",
    fontWeight: 700,
    animation: "pulse 2s ease-in-out infinite",
  },

  // Info col
  infoCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  company: {
    fontSize: 18,
    fontWeight: 600,
    color: "#9ca3af",
  },
  companyHighlight: {
    color: "#e4e4ef",
    fontWeight: 700,
  },

  // Current status
  currentStatus: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    border: "1px solid #1f1f30",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
    marginTop: 4,
  },
  statusMessage: {
    fontSize: 13,
    color: "#d1d5db",
    fontWeight: 500,
  },
  statusDetail: {
    fontSize: 12,
    color: "#4b5563",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },

  // Pipeline
  pipeline: {
    display: "flex",
    alignItems: "center",
    gap: 0,
  },
  stageWrap: {
    display: "flex",
    alignItems: "center",
    flex: 1,
  },
  stageRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  stageDot: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stageLabel: {
    fontSize: 11,
    letterSpacing: "0.02em",
  },
  connector: {
    flex: 1,
    height: 1,
    margin: "0 6px",
  },
  spinnerInner: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    border: "1.5px solid rgba(255,255,255,0.1)",
    animation: "radarSweep 0.7s linear infinite",
  } as React.CSSProperties,

  // Stat badges
  statRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  statBadge: {
    fontSize: 11,
    color: "#4b5563",
    border: "1px solid #1f1f30",
    borderRadius: 6,
    padding: "2px 8px",
  },

  // Activity log
  log: {
    padding: "12px 16px",
    background: "#0a0a14",
    borderRadius: 12,
    border: "1px solid #1a1a2e",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 200,
    overflowY: "auto",
  },
  logRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    fontSize: 12,
  },
  logTag: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    flexShrink: 0,
    width: 62,
  },
  logMsg: {
    color: "#9ca3af",
    flex: 1,
  },
  logDetail: {
    color: "#374151",
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  dotLoader: {
    display: "flex",
    gap: 3,
    alignItems: "center",
    flexShrink: 0,
  },
};
