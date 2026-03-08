"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Database,
  ExternalLink,
  GitBranch,
  House,
  Layers3,
  RefreshCw,
  Search,
  Timer,
} from "lucide-react";

type PipelineStatus = "ready" | "attention" | "draft";
type GraphRequirement = "required" | "optional" | "none";

interface PipelineWorkspaceStatus {
  workspaceId: string;
  workspaceName: string;
  workspaceEmoji: string;
  backendLabel: string;
  serviceName: string | null;
  graphEnabled: boolean;
  health: string;
}

interface CronJobSummary {
  id: string;
  name: string;
  enabled: boolean;
  scheduleDisplay: string;
  nextRun: string | null;
  lastRun: string | null;
}

interface PipelineOutputStatus {
  provider: "notion";
  label: string;
  configured: boolean;
  tokenConfigured: boolean;
  databaseConfigured: boolean;
  databaseKey: string | null;
  databaseValuePreview: string | null;
  syncMode: "approval" | "automatic";
  note: string;
}

interface PipelineSnapshot {
  id: string;
  emoji: string;
  name: string;
  domain: "internships" | "housing";
  description: string;
  status: PipelineStatus;
  statusReason: string;
  workspace: PipelineWorkspaceStatus | null;
  graphRequirement: GraphRequirement;
  automation: {
    mode: "cron";
    recommendedSchedule: string;
    linkedJob: CronJobSummary | null;
  };
  output: PipelineOutputStatus;
  searchTemplates: string[];
  stages: string[];
  reviewColumns: string[];
  boardFields: string[];
  rules: string[];
  graphQueries: string[];
}

interface PipelineDashboardSnapshot {
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    attention: number;
    scheduled: number;
    notionReady: number;
    graphReady: number;
  };
  stack: {
    mainWorkspace: PipelineWorkspaceStatus | null;
    graphWorkspace: PipelineWorkspaceStatus | null;
    neo4jStatus: string | null;
  };
  pipelines: PipelineSnapshot[];
}

function statusTone(status: PipelineStatus) {
  switch (status) {
    case "ready":
      return {
        label: "Ready",
        color: "#4ade80",
        background: "rgba(74, 222, 128, 0.12)",
        border: "rgba(74, 222, 128, 0.24)",
      };
    case "attention":
      return {
        label: "Needs Attention",
        color: "#fbbf24",
        background: "rgba(251, 191, 36, 0.12)",
        border: "rgba(251, 191, 36, 0.24)",
      };
    default:
      return {
        label: "Draft",
        color: "#94a3b8",
        background: "rgba(148, 163, 184, 0.12)",
        border: "rgba(148, 163, 184, 0.24)",
      };
  }
}

function domainIcon(domain: PipelineSnapshot["domain"]) {
  return domain === "internships" ? BriefcaseBusiness : House;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "14px",
        backgroundColor: "var(--card)",
        padding: "16px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "26px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{hint}</div>
    </div>
  );
}

function InfoPill({
  icon: Icon,
  label,
  tone = "neutral",
}: {
  icon?: ComponentType<{ size?: number; style?: CSSProperties }>;
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  const toneStyles = {
    neutral: {
      color: "var(--text-secondary)",
      background: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.08)",
    },
    accent: {
      color: "#bfdbfe",
      background: "rgba(96,165,250,0.12)",
      border: "rgba(96,165,250,0.22)",
    },
    success: {
      color: "#86efac",
      background: "rgba(34,197,94,0.12)",
      border: "rgba(34,197,94,0.22)",
    },
    warning: {
      color: "#fcd34d",
      background: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.22)",
    },
  }[tone];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        color: toneStyles.color,
        backgroundColor: toneStyles.background,
        border: `1px solid ${toneStyles.border}`,
      }}
    >
      {Icon ? <Icon size={12} /> : null}
      {label}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "16px",
        backgroundColor: "var(--card)",
        padding: "18px",
      }}
    >
      <div style={{ marginBottom: "14px" }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function WorkflowsPage() {
  const [data, setData] = useState<PipelineDashboardSnapshot | null>(null);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPipelines = async (mode: "initial" | "refresh") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const res = await fetch("/api/pipelines", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to load pipelines");
      }
      setData(payload);
      setError(null);
      setActivePipelineId((current) => current || payload.pipelines?.[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipelines");
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPipelines("initial");
  }, []);

  const activePipeline = useMemo(() => {
    if (!data?.pipelines?.length) {
      return null;
    }

    return (
      data.pipelines.find((pipeline) => pipeline.id === activePipelineId) ||
      data.pipelines[0] ||
      null
    );
  }, [activePipelineId, data]);

  return (
    <div className="p-4 md:p-8" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "28px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
                marginBottom: "6px",
              }}
            >
              Pipelines
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "880px" }}>
              Use OpenClaw cron for discovery, mem0 for preferences and learned context, and Notion as the durable
              review system for internships, housing, and other multi-step personal ops.
            </p>
          </div>

          <button
            onClick={() => void loadPipelines("refresh")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "12px",
              backgroundColor: "var(--card)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              cursor: refreshing ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {data ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {data.stack.mainWorkspace ? (
              <InfoPill
                icon={Brain}
                label={`${data.stack.mainWorkspace.workspaceName}: ${data.stack.mainWorkspace.backendLabel}`}
              />
            ) : null}
            {data.stack.graphWorkspace ? (
              <InfoPill
                icon={GitBranch}
                tone="accent"
                label={`${data.stack.graphWorkspace.workspaceName}: ${data.stack.graphWorkspace.backendLabel}`}
              />
            ) : null}
            <InfoPill
              icon={Database}
              tone={data.stack.neo4jStatus === "healthy" ? "success" : "warning"}
              label={`Neo4j ${data.stack.neo4jStatus || "unknown"}`}
            />
            <InfoPill
              icon={Timer}
              tone={data.summary.scheduled > 0 ? "success" : "warning"}
              label={`${data.summary.scheduled}/${data.summary.total} scheduled`}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 16px",
            borderRadius: "14px",
            border: "1px solid rgba(248,113,113,0.22)",
            backgroundColor: "rgba(127,29,29,0.2)",
            color: "#fecaca",
          }}
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "16px",
            backgroundColor: "var(--card)",
            padding: "28px",
            color: "var(--text-secondary)",
          }}
        >
          Loading live pipeline configuration from your OpenClaw stack...
        </div>
      ) : null}

      {data ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <MetricCard
              label="Pipelines"
              value={data.summary.total}
              hint={`${data.summary.ready} ready, ${data.summary.attention} needing attention`}
            />
            <MetricCard
              label="Automation"
              value={data.summary.scheduled}
              hint="Linked to active OpenClaw cron jobs"
            />
            <MetricCard
              label="Graph Ready"
              value={data.summary.graphReady}
              hint="Assigned to a graph-capable workspace"
            />
            <MetricCard
              label="Notion Ready"
              value={data.summary.notionReady}
              hint="Pipelines with a configured review database"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <SectionCard
              title="1. Scheduler"
              subtitle="OpenClaw cron should only trigger discovery and follow-up jobs."
            >
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Keep external actions behind approval. Cron wakes the pipeline up; it should not silently submit
                applications or contact landlords.
              </div>
            </SectionCard>

            <SectionCard
              title="2. Memory"
              subtitle="mem0 stores your preferences, past decisions, and ranking heuristics."
            >
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Use vector memory for lightweight preference recall. Use graph-backed memory only where relationship
                reasoning is actually valuable.
              </div>
            </SectionCard>

            <SectionCard
              title="3. Review Queue"
              subtitle="Notion is the source of truth for live items."
            >
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Track listings, statuses, notes, and decisions in a database, not only in memory files. This keeps the
                pipeline auditable.
              </div>
            </SectionCard>

            <SectionCard
              title="4. Human Approval"
              subtitle="The dashboard should be the control plane, not just a log viewer."
            >
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Review candidates, accept or reject, then let the sync step write approved rows into Notion and
                trigger the next task.
              </div>
            </SectionCard>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "14px",
            }}
          >
            {data.pipelines.map((pipeline) => {
              const tone = statusTone(pipeline.status);
              const Icon = domainIcon(pipeline.domain);
              const isActive = activePipeline?.id === pipeline.id;

              return (
                <button
                  key={pipeline.id}
                  onClick={() => setActivePipelineId(pipeline.id)}
                  style={{
                    textAlign: "left",
                    padding: "18px",
                    borderRadius: "18px",
                    border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: isActive
                      ? "linear-gradient(135deg, rgba(255,59,48,0.12), rgba(255,255,255,0.03))"
                      : "var(--card)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "42px",
                          height: "42px",
                          borderRadius: "12px",
                          display: "grid",
                          placeItems: "center",
                          backgroundColor: "rgba(255,255,255,0.04)",
                          color: "var(--text-primary)",
                          fontSize: "20px",
                        }}
                      >
                        {pipeline.emoji}
                      </div>
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                            marginBottom: "3px",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-heading)",
                              fontSize: "17px",
                              fontWeight: 700,
                              color: "var(--text-primary)",
                            }}
                          >
                            {pipeline.name}
                          </span>
                          <InfoPill icon={Icon} label={pipeline.domain} />
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{pipeline.description}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "6px 9px",
                        borderRadius: "999px",
                        backgroundColor: tone.background,
                        border: `1px solid ${tone.border}`,
                        color: tone.color,
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {tone.label}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    {pipeline.workspace ? (
                      <InfoPill
                        icon={Brain}
                        tone={pipeline.workspace.graphEnabled ? "accent" : "neutral"}
                        label={`${pipeline.workspace.workspaceName} -> ${pipeline.workspace.backendLabel}`}
                      />
                    ) : (
                      <InfoPill icon={Brain} tone="warning" label="Workspace missing" />
                    )}
                    <InfoPill
                      icon={Timer}
                      tone={pipeline.automation.linkedJob?.enabled ? "success" : "warning"}
                      label={pipeline.automation.linkedJob?.enabled ? "Cron linked" : "Cron missing"}
                    />
                    <InfoPill
                      icon={Database}
                      tone={pipeline.output.configured ? "success" : "warning"}
                      label={pipeline.output.configured ? "Notion ready" : "Notion pending"}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                        Trigger
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {pipeline.automation.linkedJob?.scheduleDisplay || pipeline.automation.recommendedSchedule}
                      </div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                        Review Queue
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {pipeline.reviewColumns.join(" / ")}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {pipeline.statusReason}
                  </div>
                </button>
              );
            })}
          </div>

          {activePipeline ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "14px",
              }}
            >
              <SectionCard
                title={`${activePipeline.name} Control Plane`}
                subtitle="The dashboard should surface the whole pipeline, not just the schedule."
              >
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <InfoPill
                      icon={CalendarClock}
                      tone={activePipeline.automation.linkedJob?.enabled ? "success" : "warning"}
                      label={activePipeline.automation.linkedJob?.enabled ? "Scheduled" : "Schedule recommended"}
                    />
                    <InfoPill
                      icon={Brain}
                      tone={activePipeline.workspace?.graphEnabled ? "accent" : "neutral"}
                      label={activePipeline.workspace?.backendLabel || "Workspace unresolved"}
                    />
                    <InfoPill
                      icon={Database}
                      tone={activePipeline.output.configured ? "success" : "warning"}
                      label={`${activePipeline.output.label} (${activePipeline.output.syncMode})`}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                        Workspace
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {activePipeline.workspace
                          ? `${activePipeline.workspace.workspaceEmoji} ${activePipeline.workspace.workspaceName}`
                          : "Not mapped"}
                      </div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                        Next Run
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {formatTimestamp(activePipeline.automation.linkedJob?.nextRun || null)}
                      </div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                        Last Run
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {formatTimestamp(activePipeline.automation.linkedJob?.lastRun || null)}
                      </div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                        Notion DB
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {activePipeline.output.databaseValuePreview || "Not configured"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "10px",
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        <Layers3 size={15} />
                        Execution stages
                      </div>
                      <div style={{ display: "grid", gap: "10px" }}>
                        {activePipeline.stages.map((stage, index) => (
                          <div
                            key={stage}
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "flex-start",
                              padding: "10px 12px",
                              borderRadius: "12px",
                              backgroundColor: "rgba(255,255,255,0.03)",
                            }}
                          >
                            <div
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "999px",
                                backgroundColor: "rgba(255,59,48,0.16)",
                                color: "var(--accent)",
                                display: "grid",
                                placeItems: "center",
                                fontSize: "11px",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {index + 1}
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{stage}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "10px",
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        <Search size={15} />
                        Discovery templates
                      </div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {activePipeline.searchTemplates.map((query) => (
                          <div
                            key={query}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "12px",
                              backgroundColor: "rgba(255,255,255,0.03)",
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {query}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <div style={{ display: "grid", gap: "14px" }}>
                <SectionCard
                  title="Review Board"
                  subtitle="Notion should mirror the decisions you make here."
                >
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {activePipeline.reviewColumns.map((column) => (
                        <InfoPill key={column} label={column} tone="neutral" />
                      ))}
                    </div>

                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                        Core fields
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {activePipeline.boardFields.map((field) => (
                          <InfoPill key={field} label={field} tone="accent" />
                        ))}
                      </div>
                    </div>

                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {activePipeline.output.note}
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      {activePipeline.rules.map((rule) => (
                        <div
                          key={rule}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <CheckCircle2 size={14} style={{ color: "#4ade80", flexShrink: 0, marginTop: "2px" }} />
                          <span>{rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Memory and Graph"
                  subtitle="Graph is useful when relationships matter, not by default."
                >
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {activePipeline.workspace?.graphEnabled
                        ? "This pipeline is already assigned to a graph-capable workspace, so relation-heavy queries can live in the GraphRAG explorer."
                        : activePipeline.graphRequirement === "optional"
                          ? "This pipeline currently sits on vector memory only. That is fine for preference recall and dedupe. Move it to a graph workspace only if relationships become central."
                          : "This pipeline expects a graph-capable workspace, so the assigned workspace should be upgraded before treating the pipeline as production-ready."}
                    </div>

                    {activePipeline.graphQueries.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {activePipeline.graphQueries.map((query) => (
                          <InfoPill
                            key={query}
                            icon={GitBranch}
                            tone={activePipeline.workspace?.graphEnabled ? "accent" : "warning"}
                            label={query}
                          />
                        ))}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      <Link
                        href="/memory"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px 12px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(96,165,250,0.12)",
                          color: "#bfdbfe",
                          border: "1px solid rgba(96,165,250,0.22)",
                          textDecoration: "none",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        Open Memory Stack
                        <ExternalLink size={13} />
                      </Link>

                      <Link
                        href="/cron"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px 12px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(255,255,255,0.04)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          textDecoration: "none",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        Open Cron Jobs
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Sync Path"
                  subtitle="Approval-first output keeps your automations reversible."
                >
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      The right pattern is: discovery to scoring to review queue to approval to Notion sync to follow-up.
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Environment status</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <InfoPill
                          icon={Database}
                          tone={activePipeline.output.tokenConfigured ? "success" : "warning"}
                          label={activePipeline.output.tokenConfigured ? "Notion token present" : "Missing Notion token"}
                        />
                        <InfoPill
                          icon={Database}
                          tone={activePipeline.output.databaseConfigured ? "success" : "warning"}
                          label={
                            activePipeline.output.databaseConfigured
                              ? `${activePipeline.output.databaseKey}: ${activePipeline.output.databaseValuePreview}`
                              : "Database ID missing"
                          }
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
