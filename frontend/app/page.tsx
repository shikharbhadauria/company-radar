"use client";

import { useState, useEffect } from "react";
import ResearchInput, { UserProfile, DEFAULT_PROFILE } from "@/components/ResearchInput";
import ProgressStream from "@/components/ProgressStream";
import ReportViewer from "@/components/ReportViewer";

interface ProgressEvent {
  node: string;
  message: string;
  detail?: string;
  timestamp: number;
}

interface Source {
  index: number;
  url: string;
  title: string;
}

interface HistoryEntry {
  id: string;
  companyName: string;
  timestamp: number;
  report: string;
  sources: Source[];
}

type Status = "idle" | "loading" | "done" | "error";

const HISTORY_KEY = "company_radar_history";
const MAX_HISTORY = 10;

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToHistory(entry: HistoryEntry) {
  const existing = loadHistory().filter((e) => e.id !== entry.id);
  const updated = [entry, ...existing].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function HistoryPanel({
  history,
  onLoad,
  onClear,
}: {
  history: HistoryEntry[];
  onLoad: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;

  return (
    <div style={hp.wrap}>
      <button style={hp.toggle} onClick={() => setOpen(!open)}>
        <span style={hp.arrow}>{open ? "▼" : "▶"}</span>
        History ({history.length})
        <span style={hp.clear} onClick={(e) => { e.stopPropagation(); onClear(); }}>
          Clear
        </span>
      </button>
      {open && (
        <div style={hp.list}>
          {history.map((entry) => (
            <button key={entry.id} style={hp.item} onClick={() => onLoad(entry)}>
              <span style={hp.name}>{entry.companyName}</span>
              <span style={hp.date}>
                {new Date(entry.timestamp).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const hp: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 800, margin: "0 auto 16px", padding: "0 24px",
  },
  toggle: {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    padding: "10px 16px", background: "#1a1a2e",
    border: "1px solid #2d2d3d", borderRadius: 8,
    color: "#6b7280", fontSize: 13, fontWeight: 600,
    cursor: "pointer", textAlign: "left",
  },
  arrow: { fontSize: 9, color: "#4b5563" },
  clear: {
    marginLeft: "auto", fontSize: 12, color: "#4b5563",
    padding: "2px 8px", borderRadius: 4,
    border: "1px solid #2d2d3d",
  },
  list: {
    marginTop: 4, display: "flex", flexDirection: "column", gap: 2,
    background: "#13131f", borderRadius: 8,
    border: "1px solid #2d2d3d", overflow: "hidden",
  },
  item: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 16px", background: "transparent",
    border: "none", borderBottom: "1px solid #1f1f30",
    cursor: "pointer", textAlign: "left", gap: 12,
  },
  name: { fontSize: 13, color: "#d1d5db", fontWeight: 500 },
  date: { fontSize: 12, color: "#4b5563", flexShrink: 0 },
};

export default function Home() {
  const [companyName, setCompanyName] = useState("");
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleSubmit = async () => {
    if (!companyName.trim() || status === "loading") return;

    setStatus("loading");
    setProgressEvents([]);
    setReport("");
    setErrorMsg("");

    try {
      const resp = await fetch("http://localhost:8000/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          user_profile: profile,
        }),
        cache: "no-store",
      });

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "progress") {
              setProgressEvents((prev) => [
                ...prev,
                { node: event.node, message: event.message, detail: event.detail, timestamp: Date.now() },
              ]);
            } else if (event.type === "report") {
              const entry: HistoryEntry = {
                id: `${Date.now()}`,
                companyName: companyName.trim(),
                timestamp: Date.now(),
                report: event.content,
                sources: event.sources || [],
              };
              saveToHistory(entry);
              setHistory(loadHistory());
              setReport(event.content);
              setSources(event.sources || []);
              setStatus("done");
            } else if (event.type === "error") {
              setErrorMsg(event.message);
              setStatus("error");
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (status === "loading") setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setCompanyName("");
    setStatus("idle");
    setProgressEvents([]);
    setReport("");
    setSources([]);
    setErrorMsg("");
  };

  const handleLoadHistory = (entry: HistoryEntry) => {
    setCompanyName(entry.companyName);
    setReport(entry.report);
    setSources(entry.sources);
    setStatus("done");
    setProgressEvents([]);
    setErrorMsg("");
  };

  const handleClearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  return (
    <main>
      <ResearchInput
        companyName={companyName}
        setCompanyName={setCompanyName}
        profile={profile}
        setProfile={setProfile}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        onSubmit={handleSubmit}
        loading={status === "loading"}
      />

      <HistoryPanel
        history={history}
        onLoad={handleLoadHistory}
        onClear={handleClearHistory}
      />

      {(status === "loading" || progressEvents.length > 0) && status !== "done" && (
        <ProgressStream
          events={progressEvents}
          loading={status === "loading"}
          companyName={companyName}
        />
      )}

      {status === "error" && (
        <div style={errorStyle}>
          <strong>Error:</strong> {errorMsg}
          <button onClick={handleReset} style={resetBtnStyle}>
            Try again
          </button>
        </div>
      )}

      {status === "done" && report && (
        <ReportViewer report={report} sources={sources} onReset={handleReset} />
      )}
    </main>
  );
}

const errorStyle: React.CSSProperties = {
  maxWidth: 800,
  margin: "0 auto 40px",
  padding: "16px 24px",
  background: "#2d1a1a",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
  color: "#fca5a5",
  display: "flex",
  alignItems: "center",
  gap: 16,
};

const resetBtnStyle: React.CSSProperties = {
  marginLeft: "auto",
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #7f1d1d",
  background: "transparent",
  color: "#fca5a5",
  cursor: "pointer",
  fontSize: 13,
};
