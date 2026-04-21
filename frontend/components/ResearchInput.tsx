"use client";

import { useEffect } from "react";

const STORAGE_KEY = "company_radar_profile";

export interface UserProfile {
  experience: string;
  target: string;
  priorities: string[];
  reason_leaving: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  experience: "",
  target: "",
  priorities: ["compensation", "work-life balance", "stability", "growth"],
  reason_leaving: "",
};

interface Props {
  companyName: string;
  setCompanyName: (v: string) => void;
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  profileOpen: boolean;
  setProfileOpen: (v: boolean) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function ResearchInput({
  companyName,
  setCompanyName,
  profile,
  setProfile,
  profileOpen,
  setProfileOpen,
  onSubmit,
  loading,
}: Props) {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setProfile(JSON.parse(saved));
      } else {
        setProfileOpen(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  const movePriority = (index: number, direction: -1 | 1) => {
    const next = [...profile.priorities];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setProfile({ ...profile, priorities: next });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!loading && isReady) onSubmit();
    }
  };

  const isReady = companyName.trim() !== "" && profile.experience !== "" && profile.target !== "";

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>CompanyRadar</h1>
      <p style={styles.subtitle}>
        Find the red and green flags companies don&apos;t tell you upfront.
      </p>

      <input
        type="text"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Company name (e.g. Razorpay, Flipkart, Gojek...)"
        style={styles.companyInput}
        disabled={loading}
        autoFocus
      />

      <div style={styles.profileSection}>
        <button
          type="button"
          onClick={() => setProfileOpen(!profileOpen)}
          style={styles.profileToggle}
        >
          <span style={styles.toggleArrow}>{profileOpen ? "▼" : "▶"}</span>
          <span>Your Profile</span>
          {!profileOpen && profile.experience && (
            <span style={styles.profileSummary}>{profile.experience}</span>
          )}
        </button>

        {profileOpen && (
          <div style={styles.profileForm}>
            <label style={styles.label}>
              Experience &amp; stack
              <input
                style={styles.input}
                value={profile.experience}
                onChange={(e) => setProfile({ ...profile, experience: e.target.value })}
                placeholder="e.g. 4+ years full-stack (Next.js, NestJS, TypeScript, AWS)"
                disabled={loading}
              />
            </label>

            <label style={styles.label}>
              Target salary &amp; location
              <input
                style={styles.input}
                value={profile.target}
                onChange={(e) => setProfile({ ...profile, target: e.target.value })}
                placeholder="e.g. ₹30 LPA+, Bangalore or fully remote"
                disabled={loading}
              />
            </label>

            <label style={styles.label}>
              Why leaving current job
              <input
                style={styles.input}
                value={profile.reason_leaving}
                onChange={(e) => setProfile({ ...profile, reason_leaving: e.target.value })}
                placeholder="e.g. poor work-life balance and below-market pay"
                disabled={loading}
              />
            </label>

            <div style={styles.label}>
              <span>
                Priorities{" "}
                <span style={styles.labelHint}>(reorder — top = most important)</span>
              </span>
              <div style={styles.priorityList}>
                {profile.priorities.map((p, i) => (
                  <div key={p} style={styles.priorityItem}>
                    <span style={styles.priorityRank}>{i + 1}</span>
                    <span style={styles.priorityLabel}>{p}</span>
                    <div style={styles.priorityControls}>
                      <button
                        type="button"
                        onClick={() => movePriority(i, -1)}
                        disabled={i === 0 || loading}
                        style={{
                          ...styles.arrowBtn,
                          opacity: i === 0 ? 0.3 : 1,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => movePriority(i, 1)}
                        disabled={i === profile.priorities.length - 1 || loading}
                        style={{
                          ...styles.arrowBtn,
                          opacity: i === profile.priorities.length - 1 ? 0.3 : 1,
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <p style={styles.hint}>Takes 3–8 minutes depending on your machine</p>
        <button
          onClick={onSubmit}
          disabled={loading || !isReady}
          style={{
            ...styles.button,
            opacity: loading || !isReady ? 0.5 : 1,
            cursor: loading || !isReady ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analyzing..." : "Analyze Company"}
        </button>
      </div>
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
  companyInput: {
    width: "100%",
    padding: "16px",
    borderRadius: 12,
    border: "1px solid #2d2d3d",
    background: "#1a1a2e",
    color: "#e4e4ef",
    fontSize: 18,
    outline: "none",
    fontFamily: "inherit",
    marginBottom: 16,
  },
  profileSection: {
    border: "1px solid #2d2d3d",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
  },
  profileToggle: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    background: "#1a1a2e",
    border: "none",
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  toggleArrow: {
    fontSize: 10,
    color: "#6b7280",
  },
  profileSummary: {
    marginLeft: "auto",
    color: "#6b7280",
    fontWeight: 400,
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 300,
  },
  profileForm: {
    padding: "20px 16px",
    background: "#13131f",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    borderTop: "1px solid #2d2d3d",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: 600,
  },
  labelHint: {
    fontWeight: 400,
    color: "#4b5563",
  },
  input: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #2d2d3d",
    background: "#1a1a2e",
    color: "#e4e4ef",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  },
  priorityList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  priorityItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    background: "#1a1a2e",
    borderRadius: 8,
    border: "1px solid #2d2d3d",
  },
  priorityRank: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: 700,
    width: 16,
    flexShrink: 0,
  },
  priorityLabel: {
    color: "#d1d5db",
    fontSize: 13,
    flex: 1,
    textTransform: "capitalize",
  },
  priorityControls: {
    display: "flex",
    gap: 4,
  },
  arrowBtn: {
    padding: "2px 7px",
    borderRadius: 4,
    border: "1px solid #2d2d3d",
    background: "transparent",
    color: "#9ca3af",
    fontSize: 12,
    cursor: "pointer",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  hint: {
    color: "#4b5563",
    fontSize: 13,
  },
  button: {
    padding: "12px 28px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #2563eb)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    transition: "transform 0.1s",
    flexShrink: 0,
  },
};
