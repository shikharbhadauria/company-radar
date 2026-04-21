"use client";

import { useRef, useEffect } from "react";

interface Props {
  query: string;
  setQuery: (q: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function ResearchInput({ query, setQuery, onSubmit, loading }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!loading && query.trim()) onSubmit();
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>CompanyRadar</h1>
      <p style={styles.subtitle}>Runs entirely on your machine. No API costs. No data leaves your device.</p>
      <div style={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to research? (Cmd+Enter to submit)"
          style={styles.textarea}
          disabled={loading}
          rows={3}
        />
        <button
          onClick={onSubmit}
          disabled={loading || !query.trim()}
          style={{
            ...styles.button,
            opacity: loading || !query.trim() ? 0.5 : 1,
            cursor: loading || !query.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Researching..." : "Research"}
        </button>
      </div>
      <p style={styles.hint}>This takes 3-8 minutes depending on your machine</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "60px 24px 40px",
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    marginBottom: 8,
    background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 32,
  },
  inputWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  textarea: {
    width: "100%",
    padding: "16px",
    borderRadius: 12,
    border: "1px solid #2d2d3d",
    background: "#1a1a2e",
    color: "#e4e4ef",
    fontSize: 16,
    lineHeight: 1.6,
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  },
  button: {
    alignSelf: "flex-end",
    padding: "12px 28px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #2563eb)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    transition: "transform 0.1s",
  },
  hint: {
    marginTop: 10,
    color: "#4b5563",
    fontSize: 13,
  },
};
