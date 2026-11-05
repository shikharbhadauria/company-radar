"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Source {
    index: number;
    url: string;
    title: string;
}

interface Flag {
    name: string;
    description: string;
}

interface ParsedReport {
    companyName: string;
    confidence: string;
    description: string;
    vitals: { label: string; value: string }[];
    greenFlags: Flag[];
    redFlags: Flag[];
    score: { green: number; red: number } | null;
    insight: string;
    verdictType: "PURSUE" | "CAUTION" | "AVOID" | null;
    verdictText: string;
}

interface Props {
    report: string;
    sources: Source[];
    onReset: () => void;
    generatedIn?: number | null;
}

function parseFlags(section: string): Flag[] {
    const flags: Flag[] = [];
    const regex = /^-\s+\*\*([^\*]+)\*\*[:\s]*(.+)/gm;
    let match;
    while ((match = regex.exec(section)) !== null) {
        flags.push({
            name: match[1].replace(/[\[\]]/g, "").trim(),
            description: match[2].trim(),
        });
    }
    return flags;
}

function glassdoorColor(label: string, value: string): string | undefined {
    if (!label.toLowerCase().includes("glassdoor")) return undefined;
    const match = value.match(/(\d+(\.\d+)?)/);
    if (!match) return undefined;
    const rating = parseFloat(match[1]);
    if (rating >= 3.8) return "#4ade80";
    if (rating >= 3.0) return "#fbbf24";
    return "#f87171";
}

function parseVitals(raw: string): { label: string; value: string }[] {
    return raw
        .split("|")
        .map((part) => {
            const colonIdx = part.indexOf(":");
            if (colonIdx === -1) return { label: "", value: part.trim() };
            return {
                label: part.slice(0, colonIdx).trim(),
                value: part.slice(colonIdx + 1).trim(),
            };
        })
        .filter((v) => v.value);
}

function parseReport(markdown: string): ParsedReport | null {
    const nameMatch = markdown.match(/^##\s+(.+)$/m);
    if (!nameMatch) return null;

    const confidenceMatch = markdown.match(/^##[^\n]+\n+_([^_]+)_/m);

    const descMatch = markdown.match(
        /\*\*What this company actually is\*\*[^\n]*\n+([\s\S]*?)\n*\*\*Company vitals\*\*/,
    );
    const vitalsLineMatch = markdown.match(/\*\*Company vitals\*\*\n+([^\n]+)/);
    const greenSection = markdown.match(
        /###\s*Green flags\n([\s\S]*?)###\s*Red flags/,
    );
    const redSection = markdown.match(
        /###\s*Red flags\n([\s\S]*?)(?:---|\n---)/,
    );
    const scoreMatch = markdown.match(
        /\*\*Score:\*\*\s*(\d+)\s*green\s*\/\s*(\d+)\s*red/i,
    );
    const insightMatch = markdown.match(
        /\*\*The thing most people miss[^\*]*\*\*[^\n]*\n+([\s\S]*?)(?:\n\n\*\*Verdict|\*\*Verdict)/,
    );
    const verdictTypeMatch = markdown.match(
        /\*\*Verdict:\s*(PURSUE|CAUTION|AVOID)\*\*/i,
    );
    const verdictTextMatch = markdown.match(
        /\*\*Verdict:[^\*]+\*\*\n+([\s\S]*?)$/,
    );

    return {
        companyName: nameMatch[1].trim(),
        confidence: confidenceMatch ? confidenceMatch[1].trim() : "",
        description: descMatch ? descMatch[1].trim() : "",
        vitals: vitalsLineMatch ? parseVitals(vitalsLineMatch[1]) : [],
        greenFlags: greenSection ? parseFlags(greenSection[1]) : [],
        redFlags: redSection ? parseFlags(redSection[1]) : [],
        score: scoreMatch
            ? { green: parseInt(scoreMatch[1]), red: parseInt(scoreMatch[2]) }
            : null,
        insight: insightMatch ? insightMatch[1].trim() : "",
        verdictType: verdictTypeMatch
            ? (verdictTypeMatch[1].toUpperCase() as
                  | "PURSUE"
                  | "CAUTION"
                  | "AVOID")
            : null,
        verdictText: verdictTextMatch ? verdictTextMatch[1].trim() : "",
    };
}

const VERDICT_COLORS: Record<
    string,
    { bg: string; border: string; text: string; badge: string }
> = {
    PURSUE: {
        bg: "#0d2218",
        border: "#166534",
        text: "#4ade80",
        badge: "#16a34a",
    },
    CAUTION: {
        bg: "#1f1a08",
        border: "#854d0e",
        text: "#fbbf24",
        badge: "#d97706",
    },
    AVOID: {
        bg: "#1f0808",
        border: "#7f1d1d",
        text: "#f87171",
        badge: "#dc2626",
    },
};

function formatTime(s: number): string {
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function ReportViewer({
    report,
    sources,
    onReset,
    generatedIn,
}: Props) {
    const [copied, setCopied] = useState(false);
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const parsed = parseReport(report);

    const mobileStyles = `
    @media (max-width: 480px) {
      .rv-container { padding: 0 12px !important; }
      .rv-header { padding: 20px 16px 16px !important; }
      .rv-company-name { font-size: 22px !important; }
      .rv-flags-grid { grid-template-columns: 1fr !important; }
      .rv-toolbar { flex-direction: column !important; align-items: flex-start !important; }
      .rv-vitals { gap: 6px !important; }
      .rv-vital-item { padding: 6px 10px !important; }
      .rv-verdict { padding: 16px 18px !important; }
    }
  `;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(report);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!parsed) {
        return (
            <div style={s.container}>
                <Toolbar
                    copied={copied}
                    onCopy={handleCopy}
                    onReset={onReset}
                    generatedIn={generatedIn}
                />
                <div style={s.reportBody}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {report}
                    </ReactMarkdown>
                </div>
            </div>
        );
    }

    const verdictColors = parsed.verdictType
        ? VERDICT_COLORS[parsed.verdictType]
        : null;

    return (
        <div style={s.container} className="rv-container">
            <style>{mobileStyles}</style>
            <Toolbar
                copied={copied}
                onCopy={handleCopy}
                onReset={onReset}
                generatedIn={generatedIn}
            />

            {/* Header */}
            <div style={s.header} className="rv-header">
                <div style={s.headerTop}>
                    <h1 style={s.companyName} className="rv-company-name">
                        {parsed.companyName}
                    </h1>
                    {parsed.verdictType && verdictColors && (
                        <span
                            style={{
                                ...s.verdictBadge,
                                background: verdictColors.badge,
                            }}
                        >
                            {parsed.verdictType}
                        </span>
                    )}
                </div>
                {parsed.confidence && (
                    <p style={s.confidence}>{parsed.confidence}</p>
                )}
                {parsed.description && (
                    <p style={s.description}>{parsed.description}</p>
                )}
                {parsed.vitals.length > 0 && (
                    <div style={s.vitalsGrid} className="rv-vitals">
                        {parsed.vitals.map((v, i) => {
                            const accentColor = glassdoorColor(
                                v.label,
                                v.value,
                            );
                            return (
                                <div
                                    key={i}
                                    className="rv-vital-item"
                                    style={{
                                        ...s.vitalItem,
                                        ...(accentColor
                                            ? {
                                                  borderColor: `${accentColor}40`,
                                              }
                                            : {}),
                                    }}
                                >
                                    {v.label && (
                                        <span style={s.vitalLabel}>
                                            {v.label}
                                        </span>
                                    )}
                                    <span
                                        style={{
                                            ...s.vitalValue,
                                            ...(accentColor
                                                ? { color: accentColor }
                                                : {}),
                                        }}
                                    >
                                        {v.value}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Flags */}
            {(parsed.greenFlags.length > 0 || parsed.redFlags.length > 0) && (
                <div style={s.flagsGrid} className="rv-flags-grid">
                    {parsed.greenFlags.length > 0 && (
                        <div
                            style={{ ...s.flagSection, borderColor: "#166534" }}
                        >
                            <h3 style={{ ...s.flagHeading, color: "#4ade80" }}>
                                <span style={s.flagIcon}>✓</span> Green Flags
                            </h3>
                            {parsed.greenFlags.map((f, i) => (
                                <FlagCard
                                    key={i}
                                    flag={f}
                                    color="#4ade80"
                                    bg="#0d2218"
                                />
                            ))}
                        </div>
                    )}
                    {parsed.redFlags.length > 0 && (
                        <div
                            style={{ ...s.flagSection, borderColor: "#7f1d1d" }}
                        >
                            <h3 style={{ ...s.flagHeading, color: "#f87171" }}>
                                <span style={s.flagIcon}>✗</span> Red Flags
                            </h3>
                            {parsed.redFlags.map((f, i) => (
                                <FlagCard
                                    key={i}
                                    flag={f}
                                    color="#f87171"
                                    bg="#1f0808"
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Score */}
            {parsed.score && (
                <div style={s.scoreRow}>
                    <span style={s.scoreLabel}>Score</span>
                    <span
                        style={{
                            ...s.scorePill,
                            background: "#0d2218",
                            color: "#4ade80",
                        }}
                    >
                        {parsed.score.green} green
                    </span>
                    <span
                        style={{
                            ...s.scorePill,
                            background: "#1f0808",
                            color: "#f87171",
                        }}
                    >
                        {parsed.score.red} red
                    </span>
                </div>
            )}

            {/* Hidden insight */}
            {parsed.insight && (
                <div style={s.insightBox}>
                    <div style={s.insightHeading}>
                        <span style={s.insightIcon}>💡</span>
                        <span>What most people miss</span>
                    </div>
                    <p style={s.insightText}>{parsed.insight}</p>
                </div>
            )}

            {/* Verdict */}
            {parsed.verdictType && verdictColors && (
                <div
                    style={{
                        ...s.verdictBox,
                        background: verdictColors.bg,
                        borderColor: verdictColors.border,
                    }}
                >
                    <div
                        style={{
                            ...s.verdictHeading,
                            color: verdictColors.text,
                        }}
                    >
                        Verdict: {parsed.verdictType}
                    </div>
                    {parsed.verdictText && (
                        <p style={s.verdictText}>{parsed.verdictText}</p>
                    )}
                </div>
            )}

            {/* Sources */}
            {sources.length > 0 && (
                <div style={s.sourcesBox}>
                    <button
                        style={s.sourcesToggle}
                        onClick={() => setSourcesOpen(!sourcesOpen)}
                    >
                        <span style={s.sourcesArrow}>
                            {sourcesOpen ? "▼" : "▶"}
                        </span>
                        Sources ({sources.length})
                    </button>
                    {sourcesOpen && (
                        <div style={s.sourcesList}>
                            {sources.map((src) => (
                                <a
                                    key={src.index}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={s.sourceItem}
                                >
                                    <span style={s.sourceIndex}>
                                        [{src.index}]
                                    </span>
                                    <span style={s.sourceTitle}>
                                        {src.title || src.url}
                                    </span>
                                    <span style={s.sourceArrow}>↗</span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Toolbar({
    copied,
    onCopy,
    onReset,
    generatedIn,
}: {
    copied: boolean;
    onCopy: () => void;
    onReset: () => void;
    generatedIn?: number | null;
}) {
    return (
        <div style={s.toolbar} className="rv-toolbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h2 style={s.toolbarHeading}>Research Report</h2>
                {generatedIn != null && (
                    <span style={s.timeBadge}>
                        Generated in {formatTime(generatedIn)}
                    </span>
                )}
            </div>
            <div style={s.actions}>
                <button onClick={onCopy} style={s.btnSecondary}>
                    {copied ? "Copied!" : "Copy report"}
                </button>
                <button onClick={onReset} style={s.btnPrimary}>
                    New company
                </button>
            </div>
        </div>
    );
}

function FlagCard({
    flag,
    color,
    bg,
}: {
    flag: Flag;
    color: string;
    bg: string;
}) {
    return (
        <div style={{ ...s.flagCard, background: bg }}>
            <span style={{ ...s.flagName, color }}>{flag.name}</span>
            <span style={s.flagDesc}>{flag.description}</span>
        </div>
    );
}

const s: Record<string, React.CSSProperties> = {
    container: { maxWidth: 800, margin: "0 auto 80px", padding: "0 24px" },
    toolbar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
        flexWrap: "wrap",
        gap: 12,
    },
    toolbarHeading: {
        fontSize: 14,
        fontWeight: 600,
        color: "#6b7280",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
    },
    timeBadge: {
        fontSize: 12,
        color: "#6b7280",
        padding: "3px 10px",
        borderRadius: 20,
        border: "1px solid #2d2d3d",
        background: "#13131f",
    },
    actions: { display: "flex", gap: 10 },
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

    // Header
    header: {
        padding: "28px 28px 24px",
        background: "#1a1a2e",
        borderRadius: 12,
        border: "1px solid #2d2d3d",
        marginBottom: 16,
    },
    headerTop: {
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 12,
        flexWrap: "wrap",
    },
    companyName: { fontSize: 28, fontWeight: 700, color: "#e4e4ef", margin: 0 },
    verdictBadge: {
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "0.05em",
    },
    confidence: {
        color: "#4b5563",
        fontSize: 12,
        marginBottom: 8,
        marginTop: -4,
    },
    description: {
        color: "#9ca3af",
        fontSize: 14,
        lineHeight: 1.7,
        marginBottom: 20,
    },
    vitalsGrid: {
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        paddingTop: 16,
        borderTop: "1px solid #2d2d3d",
    },
    vitalItem: {
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 14px",
        background: "#13131f",
        borderRadius: 8,
        border: "1px solid #2d2d3d",
    },
    vitalLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: "#4b5563",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
    },
    vitalValue: { fontSize: 13, color: "#d1d5db", fontWeight: 500 },

    // Flags
    flagsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
        marginBottom: 16,
    },
    flagSection: {
        padding: "20px",
        background: "#1a1a2e",
        borderRadius: 12,
        border: "1px solid",
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    flagHeading: {
        fontSize: 13,
        fontWeight: 700,
        margin: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    flagIcon: { fontSize: 16 },
    flagCard: {
        padding: "10px 12px",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
    },
    flagName: { fontSize: 12, fontWeight: 700 },
    flagDesc: { fontSize: 13, color: "#9ca3af", lineHeight: 1.5 },

    // Score
    scoreRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        padding: "14px 20px",
        background: "#1a1a2e",
        borderRadius: 10,
        border: "1px solid #2d2d3d",
    },
    scoreLabel: {
        fontSize: 13,
        fontWeight: 600,
        color: "#6b7280",
        marginRight: 4,
    },
    scorePill: {
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
    },

    // Insight
    insightBox: {
        padding: "20px 24px",
        background: "#131a2e",
        borderRadius: 12,
        border: "1px solid #1e3a5f",
        marginBottom: 16,
    },
    insightHeading: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        fontWeight: 700,
        color: "#60a5fa",
        marginBottom: 10,
    },
    insightIcon: { fontSize: 16 },
    insightText: { fontSize: 14, color: "#93c5fd", lineHeight: 1.7, margin: 0 },

    // Verdict
    verdictBox: {
        padding: "24px 28px",
        borderRadius: 12,
        border: "1px solid",
        marginBottom: 16,
    },
    verdictHeading: {
        fontSize: 18,
        fontWeight: 800,
        marginBottom: 12,
        letterSpacing: "0.02em",
    },
    verdictText: { fontSize: 14, color: "#d1d5db", lineHeight: 1.8, margin: 0 },

    // Sources
    sourcesBox: {
        background: "#1a1a2e",
        borderRadius: 12,
        border: "1px solid #2d2d3d",
        overflow: "hidden",
    },
    sourcesToggle: {
        width: "100%",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "transparent",
        border: "none",
        color: "#6b7280",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        textAlign: "left",
    },
    sourcesArrow: { fontSize: 10, color: "#4b5563" },
    sourcesList: { borderTop: "1px solid #2d2d3d", padding: "8px 0" },
    sourceItem: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        textDecoration: "none",
        transition: "background 0.15s",
    },
    sourceIndex: {
        fontSize: 11,
        color: "#4b5563",
        fontWeight: 700,
        flexShrink: 0,
        width: 24,
    },
    sourceTitle: {
        fontSize: 13,
        color: "#60a5fa",
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    sourceArrow: { fontSize: 11, color: "#4b5563", flexShrink: 0 },

    // Fallback markdown
    reportBody: {
        padding: "32px",
        background: "#1a1a2e",
        borderRadius: 12,
        border: "1px solid #2d2d3d",
        lineHeight: 1.8,
    },
};
