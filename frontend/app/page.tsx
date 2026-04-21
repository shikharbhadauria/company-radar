"use client";

import { useState } from "react";
import ResearchInput, { UserProfile, DEFAULT_PROFILE } from "@/components/ResearchInput";
import ProgressStream from "@/components/ProgressStream";
import ReportViewer from "@/components/ReportViewer";

interface ProgressEvent {
  node: string;
  message: string;
  timestamp: number;
}

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [companyName, setCompanyName] = useState("");
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

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
                { node: event.node, message: event.message, timestamp: Date.now() },
              ]);
            } else if (event.type === "report") {
              setReport(event.content);
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
    setErrorMsg("");
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

      {(status === "loading" || progressEvents.length > 0) && status !== "done" && (
        <ProgressStream events={progressEvents} />
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
        <ReportViewer report={report} onReset={handleReset} />
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
