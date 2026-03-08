"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  FileText,
  FolderOpen,
  Puzzle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { MetricCard } from "@/components/TenacitOS";

interface SkillRequirements {
  bins: string[];
  env: string[];
  config: string[];
  os: string[];
}

interface SkillConfigCheck {
  path: string;
  satisfied: boolean;
}

interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

interface Skill {
  id: string;
  name: string;
  description: string;
  source: string;
  sourceGroup: "workspace" | "system";
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: SkillRequirements;
  missing: SkillRequirements;
  configChecks: SkillConfigCheck[];
  install: SkillInstallOption[];
}

interface SkillsData {
  source: string;
  agentId: string;
  defaultAgentId: string;
  workspaceDir: string;
  managedSkillsDir: string;
  summary: {
    total: number;
    ready: number;
    blocked: number;
    disabled: number;
    selected: number;
    excluded: number;
  };
  skills: Skill[];
}

function formatSkillMissing(skill: Skill): string[] {
  return [
    ...skill.missing.bins.map((bin) => `bin:${bin}`),
    ...skill.missing.env.map((env) => `env:${env}`),
    ...skill.missing.config.map((config) => `config:${config}`),
    ...skill.missing.os.map((os) => `os:${os}`),
  ];
}

function formatSkillReasons(skill: Skill): string[] {
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push("disabled");
  }
  if (skill.blockedByAllowlist) {
    reasons.push("blocked by allowlist");
  }
  return reasons;
}

function summarizeRequirements(requirements: SkillRequirements): string {
  const entries = [
    ...requirements.bins.map((bin) => `bin:${bin}`),
    ...requirements.env.map((env) => `env:${env}`),
    ...requirements.config.map((config) => `config:${config}`),
    ...requirements.os.map((os) => `os:${os}`),
  ];

  return entries.length > 0 ? entries.join(", ") : "None";
}

export default function SkillsPage() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "blocked" | "disabled">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "workspace" | "system">("all");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const fetchSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/skills", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Skills API returned ${response.status}`);
      }
      const nextData = (await response.json()) as SkillsData;
      setData(nextData);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSkills();
  }, []);

  const skills = data?.skills || [];
  const filteredSkills = skills.filter((skill) => {
    if (sourceFilter !== "all" && skill.sourceGroup !== sourceFilter) {
      return false;
    }

    if (statusFilter === "ready" && !skill.eligible) {
      return false;
    }
    if (statusFilter === "blocked" && skill.eligible) {
      return false;
    }
    if (statusFilter === "disabled" && !skill.disabled) {
      return false;
    }

    if (!searchQuery.trim()) {
      return true;
    }

    const haystack = [
      skill.name,
      skill.description,
      skill.skillKey,
      skill.source,
      skill.primaryEnv || "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "24px",
            fontWeight: 700,
            letterSpacing: "-1px",
            color: "var(--text-primary)",
            marginBottom: "4px",
          }}
        >
          OpenClaw Skills Status
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          Mirrors the OpenClaw gateway <code>skills.status</code> report for the default agent workspace.
        </p>
        {data && (
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "12px",
              color: "var(--text-muted)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>agent: {data.agentId}</span>
            <span>workspace: {data.workspaceDir}</span>
            <span>managed: {data.managedSkillsDir}</span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <MetricCard icon={Puzzle} value={data?.summary.total || 0} label="Total Skills" />
        <MetricCard icon={CheckCircle2} value={data?.summary.ready || 0} label="Ready" changeColor="positive" />
        <MetricCard icon={AlertTriangle} value={data?.summary.blocked || 0} label="Blocked" changeColor="warning" />
        <MetricCard icon={CircleSlash} value={data?.summary.disabled || 0} label="Disabled" changeColor="negative" />
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "240px" }}>
          <Search
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "16px",
              height: "16px",
              color: "var(--text-muted)",
            }}
          />
          <input
            type="text"
            placeholder="Search skills by name, source, key, description..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={{
              width: "100%",
              paddingLeft: "40px",
              paddingRight: "16px",
              paddingTop: "12px",
              paddingBottom: "12px",
              borderRadius: "6px",
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: "12px",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "all" as const, label: `All (${data?.summary.total || 0})` },
            { id: "ready" as const, label: `Ready (${data?.summary.ready || 0})` },
            { id: "blocked" as const, label: `Blocked (${data?.summary.blocked || 0})` },
            { id: "disabled" as const, label: `Disabled (${data?.summary.disabled || 0})` },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatusFilter(filter.id)}
              style={{
                padding: "12px 16px",
                borderRadius: "6px",
                backgroundColor: statusFilter === filter.id ? "var(--accent-soft)" : "var(--surface)",
                color: statusFilter === filter.id ? "var(--accent)" : "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "all" as const, label: "All Sources" },
            { id: "workspace" as const, label: "Workspace Sources" },
            { id: "system" as const, label: "Bundled Sources" },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSourceFilter(filter.id)}
              style={{
                padding: "12px 16px",
                borderRadius: "6px",
                backgroundColor: sourceFilter === filter.id ? "var(--accent-soft)" : "var(--surface)",
                color: sourceFilter === filter.id ? "var(--accent)" : "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => void fetchSkills()}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            borderRadius: "6px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} style={{ width: "14px", height: "14px" }} />
          Refresh
        </button>
      </div>

      {error ? (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.24)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "24px",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
        </div>
      ) : filteredSkills.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--surface)",
            borderRadius: "12px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <Puzzle
            style={{
              width: "48px",
              height: "48px",
              color: "var(--text-muted)",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "var(--text-secondary)" }}>No matching skills found</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "12px",
          }}
        >
          {filteredSkills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onClick={() => setSelectedSkill(skill)} />
          ))}
        </div>
      )}

      {selectedSkill ? <SkillDetailModal skill={selectedSkill} onClose={() => setSelectedSkill(null)} /> : null}
    </div>
  );
}

function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  const missing = formatSkillMissing(skill);
  const reasons = formatSkillReasons(skill);

  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: "var(--surface)",
        borderRadius: "12px",
        padding: "16px",
        border: "1px solid var(--border)",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            fontSize: "22px",
            flexShrink: 0,
          }}
        >
          {skill.emoji || "🧩"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
            <h3
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {skill.name}
            </h3>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "4px 8px",
                borderRadius: "999px",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              {skill.source}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {skill.description}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <StatusChip label={skill.eligible ? "eligible" : "blocked"} tone={skill.eligible ? "ready" : "blocked"} />
        {skill.disabled ? <StatusChip label="disabled" tone="disabled" /> : null}
        {skill.bundled ? <StatusChip label="bundled" tone="neutral" /> : null}
        {skill.primaryEnv ? <StatusChip label={`env:${skill.primaryEnv}`} tone="neutral" /> : null}
      </div>

      {!skill.eligible && missing.length > 0 ? (
        <div style={{ color: "#fbbf24", fontSize: "12px", lineHeight: 1.6, marginBottom: "8px" }}>
          Missing: {missing.join(", ")}
        </div>
      ) : null}

      {reasons.length > 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.6 }}>
          Reason: {reasons.join(", ")}
        </div>
      ) : (
        <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.6 }}>
          File: {skill.filePath}
        </div>
      )}
    </button>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "ready" | "blocked" | "disabled" | "neutral";
}) {
  const palette =
    tone === "ready"
      ? { background: "rgba(34, 197, 94, 0.12)", color: "#86efac", border: "rgba(34, 197, 94, 0.28)" }
      : tone === "blocked"
        ? { background: "rgba(245, 158, 11, 0.14)", color: "#fcd34d", border: "rgba(245, 158, 11, 0.28)" }
        : tone === "disabled"
          ? { background: "rgba(239, 68, 68, 0.12)", color: "#fca5a5", border: "rgba(239, 68, 68, 0.24)" }
          : { background: "var(--surface-elevated)", color: "var(--text-muted)", border: "var(--border)" };

  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        backgroundColor: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
      }}
    >
      {label}
    </span>
  );
}

function SkillDetailModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const missing = formatSkillMissing(skill);
  const reasons = formatSkillReasons(skill);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--surface)",
          borderRadius: "16px",
          maxWidth: "880px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          border: "1px solid var(--border)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "24px",
              right: "24px",
              padding: "8px",
              borderRadius: "6px",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <X style={{ width: "20px", height: "20px" }} />
          </button>

          <div style={{ display: "flex", gap: "16px", paddingRight: "40px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                fontSize: "28px",
              }}
            >
              {skill.emoji || "🧩"}
            </div>
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                }}
              >
                {skill.name}
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  marginBottom: "12px",
                  lineHeight: 1.7,
                }}
              >
                {skill.description}
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <StatusChip label={skill.source} tone="neutral" />
                <StatusChip label={skill.eligible ? "eligible" : "blocked"} tone={skill.eligible ? "ready" : "blocked"} />
                {skill.disabled ? <StatusChip label="disabled" tone="disabled" /> : null}
                {skill.bundled ? <StatusChip label="bundled" tone="neutral" /> : null}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "24px", display: "grid", gap: "20px" }}>
          <DetailSection
            icon={Bot}
            title="Skill Record"
            items={[
              { label: "Skill Key", value: skill.skillKey },
              { label: "Source", value: skill.source },
              { label: "Base Dir", value: skill.baseDir },
              { label: "File Path", value: skill.filePath },
              { label: "Primary Env", value: skill.primaryEnv || "None" },
            ]}
          />

          <DetailSection
            icon={AlertTriangle}
            title="Availability"
            items={[
              { label: "Missing", value: missing.length > 0 ? missing.join(", ") : "None" },
              { label: "Reasons", value: reasons.length > 0 ? reasons.join(", ") : "None" },
              { label: "Requirements", value: summarizeRequirements(skill.requirements) },
            ]}
          />

          <DetailSection
            icon={FolderOpen}
            title="Config Checks"
            items={
              skill.configChecks.length > 0
                ? skill.configChecks.map((check) => ({
                    label: check.path,
                    value: check.satisfied ? "satisfied" : "missing",
                  }))
                : [{ label: "Checks", value: "None" }]
            }
          />

          <DetailSection
            icon={FileText}
            title="Install Options"
            items={
              skill.install.length > 0
                ? skill.install.map((install) => ({
                    label: `${install.kind}:${install.id}`,
                    value: `${install.label}${install.bins.length > 0 ? ` [${install.bins.join(", ")}]` : ""}`,
                  }))
                : [{ label: "Install", value: "None" }]
            }
          />

          {skill.homepage ? (
            <a
              href={skill.homepage}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--accent)",
                fontSize: "13px",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <ExternalLink style={{ width: "14px", height: "14px" }} />
              Open skill homepage
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Bot;
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-elevated)",
        borderRadius: "12px",
        padding: "16px",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Icon style={{ width: "16px", height: "16px", color: "var(--accent)" }} />
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-heading)",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h3>
      </div>
      <div style={{ display: "grid", gap: "8px" }}>
        {items.map((item) => (
          <div
            key={`${title}-${item.label}`}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: "12px",
              alignItems: "start",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{item.label}</div>
            <div style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.6 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
