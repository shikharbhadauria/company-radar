"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  report: string;
  onReset: () => void;
}

export default function ReportViewer({ report, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <h2 style={styles.heading}>Research Report</h2>
        <div style={styles.actions}>
          <button onClick={handleCopy} style={styles.btnSecondary}>
            {copied ? "Copied!" : "Copy report"}
          </button>
          <button onClick={onReset} style={styles.btnPrimary}>
            New company
          </button>
        </div>
      </div>
      <div style={styles.reportBody}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 style={styles.h1}>{children}</h1>,
            h2: ({ children }) => <h2 style={styles.h2}>{children}</h2>,
            h3: ({ children }) => <h3 style={styles.h3}>{children}</h3>,
            p: ({ children }) => <p style={styles.p}>{children}</p>,
            ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
            ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
            li: ({ children }) => <li style={styles.li}>{children}</li>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" style={styles.a}>
                {children}
              </a>
            ),
            code: ({ children }) => <code style={styles.code}>{children}</code>,
            blockquote: ({ children }) => <blockquote style={styles.blockquote}>{children}</blockquote>,
            hr: () => <hr style={styles.hr} />,
          }}
        >
          {report}
        </ReactMarkdown>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto 80px",
    padding: "0 24px",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
    color: "#e4e4ef",
  },
  actions: {
    display: "flex",
    gap: 10,
  },
  btnSecondary: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #2d2d3d",
    background: "transparent",
    color: "#9ca3af",
    fontSize: 13,
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #2563eb)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  reportBody: {
    padding: "32px",
    background: "#1a1a2e",
    borderRadius: 12,
    border: "1px solid #2d2d3d",
    lineHeight: 1.8,
  },
  h1: { fontSize: 26, fontWeight: 700, marginBottom: 16, marginTop: 24, color: "#e4e4ef" },
  h2: { fontSize: 20, fontWeight: 700, marginBottom: 12, marginTop: 28, color: "#c4b5fd", borderBottom: "1px solid #2d2d3d", paddingBottom: 8 },
  h3: { fontSize: 16, fontWeight: 600, marginBottom: 8, marginTop: 20, color: "#93c5fd" },
  p: { marginBottom: 14, color: "#d1d5db", fontSize: 15 },
  ul: { marginBottom: 14, paddingLeft: 24 },
  ol: { marginBottom: 14, paddingLeft: 24 },
  li: { marginBottom: 6, color: "#d1d5db", fontSize: 15 },
  a: { color: "#60a5fa", textDecoration: "underline" },
  code: { background: "#0f0f1a", padding: "2px 6px", borderRadius: 4, fontSize: 13, fontFamily: "monospace" },
  blockquote: { borderLeft: "3px solid #4b5563", paddingLeft: 16, color: "#6b7280", fontStyle: "italic", margin: "16px 0" },
  hr: { border: "none", borderTop: "1px solid #2d2d3d", margin: "24px 0" },
};
