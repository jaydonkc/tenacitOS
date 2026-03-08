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
  scheduleKind: string | null;
  cronExpr: string | null;
  timezone: string | null;
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
  board: NotionBoardSnapshot | null;
}

interface NotionStatusBucket {
  name: string;
  color: string | null;
  count: number;
  expected: boolean;
}

interface NotionBoardSnapshot {
  available: boolean;
  source: "data_source" | "database" | null;
  dataSourceId: string | null;
  schemaName: string | null;
  propertyName: string | null;
  propertyType: "status" | "select" | "multi_select" | "rich_text" | "title" | null;
  totalPages: number | null;
  lastEditedTime: string | null;
  statusOptions: string[];
  buckets: NotionStatusBucket[];
  missingExpectedStages: string[];
  extraStages: string[];
  aligned: boolean;
  error: string | null;
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
    recommendedCronExpr: string;
    recommendedTimezone: string;
    cronJobName: string;
    agentId: string;
    sessionId: string;
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

function notionColorStyle(color: string | null): { backgroundColor: string; borderColor: string; color: string } {
  switch (color) {
    case "green":
      return { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.22)", color: "#86efac" };
    case "yellow":
      return { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.22)", color: "#fcd34d" };
    case "orange":
      return { backgroundColor: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.22)", color: "#fdba74" };
    case "red":
      return { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.22)", color: "#fca5a5" };
    case "blue":
      return { backgroundColor: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.22)", color: "#93c5fd" };
    case "purple":
      return { backgroundColor: "rgba(168,85,247,0.12)", borderColor: "rgba(168,85,247,0.22)", color: "#d8b4fe" };
    case "pink":
      return { backgroundColor: "rgba(236,72,153,0.12)", borderColor: "rgba(236,72,153,0.22)", color: "#f9a8d4" };
    case "brown":
      return { backgroundColor: "rgba(161,98,7,0.14)", borderColor: "rgba(161,98,7,0.24)", color: "#fcd34d" };
    case "gray":
    default:
      return { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" };
  }
}

const TIMEZONE_OPTIONS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
];

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
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState("America/Los_Angeles");
  const [triggerEnabled, setTriggerEnabled] = useState(true);
  const [triggerSaving, setTriggerSaving] = useState(false);
  const [triggerRunning, setTriggerRunning] = useState(false);
  const [triggerFeedback, setTriggerFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

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

  useEffect(() => {
    if (!activePipeline) {
      return;
    }

    setScheduleDraft(
      activePipeline.automation.linkedJob?.cronExpr || activePipeline.automation.recommendedCronExpr
    );
    setTimezoneDraft(
      activePipeline.automation.linkedJob?.timezone || activePipeline.automation.recommendedTimezone
    );
    setTriggerEnabled(activePipeline.automation.linkedJob?.enabled ?? true);
    setTriggerFeedback(null);
  }, [activePipeline]);

  const saveTrigger = async () => {
    if (!activePipeline) {
      return;
    }

    setTriggerSaving(true);
    setTriggerFeedback(null);

    try {
      const res = await fetch(`/api/pipelines/${activePipeline.id}/trigger`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cronExpr: scheduleDraft,
          timezone: timezoneDraft,
          enabled: triggerEnabled,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to save pipeline schedule");
      }

      await loadPipelines("refresh");
      setTriggerFeedback({
        tone: "success",
        message: triggerEnabled ? "Pipeline schedule saved." : "Pipeline schedule saved in paused mode.",
      });
    } catch (err) {
      setTriggerFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Failed to save pipeline schedule",
      });
    } finally {
      setTriggerSaving(false);
    }
  };

  const runPipelineNow = async () => {
    if (!activePipeline) {
      return;
    }

    setTriggerRunning(true);
    setTriggerFeedback(null);

    try {
      const res = await fetch(`/api/pipelines/${activePipeline.id}/trigger`, {
        method: "POST",
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to run pipeline");
      }

      await loadPipelines("refresh");
      setTriggerFeedback({
        tone: "success",
        message:
          payload.source === "cron-job"
            ? "Pipeline triggered from its saved schedule."
            : "Pipeline triggered directly.",
      });
    } catch (err) {
      setTriggerFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Failed to run pipeline",
      });
    } finally {
      setTriggerRunning(false);
    }
  };

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
              hint="Pipelines with a readable live Notion board"
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
                      tone={
                        pipeline.output.board?.available
                          ? "success"
                          : pipeline.output.configured
                            ? "warning"
                            : "warning"
                      }
                      label={
                        pipeline.output.board?.available
                          ? `${pipeline.output.board.totalPages ?? 0} live Notion items`
                          : pipeline.output.configured
                            ? "Notion unreadable"
                            : "Notion pending"
                      }
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
                      tone={
                        activePipeline.output.board?.available
                          ? "success"
                          : activePipeline.output.configured
                            ? "warning"
                            : "warning"
                      }
                      label={
                        activePipeline.output.board?.available
                          ? `${activePipeline.output.label}: ${activePipeline.output.board.totalPages ?? 0} items`
                          : `${activePipeline.output.label} (${activePipeline.output.syncMode})`
                      }
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
                        Notion Board
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {activePipeline.output.board?.schemaName || activePipeline.output.databaseValuePreview || "Not configured"}
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
                  title="Trigger Control"
                  subtitle="Schedule the pipeline or fire it immediately."
                >
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <InfoPill
                        icon={Timer}
                        tone={activePipeline.automation.linkedJob ? "success" : "warning"}
                        label={
                          activePipeline.automation.linkedJob
                            ? `Saved job: ${activePipeline.automation.linkedJob.name}`
                            : "No saved trigger yet"
                        }
                      />
                      <InfoPill
                        icon={CalendarClock}
                        tone={triggerEnabled ? "success" : "warning"}
                        label={triggerEnabled ? "Schedule enabled" : "Schedule paused"}
                      />
                      <InfoPill
                        icon={Brain}
                        label={`${activePipeline.automation.agentId} -> ${activePipeline.automation.sessionId}`}
                        tone="neutral"
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-muted)",
                            marginBottom: "6px",
                          }}
                        >
                          Cron Expression
                        </div>
                        <input
                          value={scheduleDraft}
                          onChange={(event) => setScheduleDraft(event.target.value)}
                          placeholder={activePipeline.automation.recommendedCronExpr}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "12px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg)",
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "13px",
                          }}
                        />
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                          Recommended: {activePipeline.automation.recommendedCronExpr} ({activePipeline.automation.recommendedSchedule})
                        </div>
                      </div>

                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-muted)",
                            marginBottom: "6px",
                          }}
                        >
                          Timezone
                        </div>
                        <input
                          list="pipeline-timezones"
                          value={timezoneDraft}
                          onChange={(event) => setTimezoneDraft(event.target.value)}
                          placeholder={activePipeline.automation.recommendedTimezone}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "12px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg)",
                            color: "var(--text-primary)",
                            fontSize: "13px",
                          }}
                        />
                        <datalist id="pipeline-timezones">
                          {TIMEZONE_OPTIONS.map((timezone) => (
                            <option key={timezone} value={timezone} />
                          ))}
                        </datalist>
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                          Recommended: {activePipeline.automation.recommendedTimezone}
                        </div>
                      </div>
                    </div>

                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={triggerEnabled}
                        onChange={(event) => setTriggerEnabled(event.target.checked)}
                      />
                      Keep this pipeline trigger enabled after saving
                    </label>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      <button
                        onClick={() => {
                          setScheduleDraft(activePipeline.automation.recommendedCronExpr);
                          setTimezoneDraft(activePipeline.automation.recommendedTimezone);
                          setTriggerEnabled(true);
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--bg)",
                          color: "var(--text-primary)",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Use Recommended
                      </button>

                      <button
                        onClick={() => void saveTrigger()}
                        disabled={triggerSaving}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: "1px solid rgba(255,59,48,0.28)",
                          backgroundColor: "rgba(255,59,48,0.14)",
                          color: "var(--accent)",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: triggerSaving ? "wait" : "pointer",
                          opacity: triggerSaving ? 0.7 : 1,
                        }}
                      >
                        {triggerSaving ? "Saving..." : activePipeline.automation.linkedJob ? "Update Schedule" : "Save Schedule"}
                      </button>

                      <button
                        onClick={() => void runPipelineNow()}
                        disabled={triggerRunning}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: "1px solid rgba(34,197,94,0.28)",
                          backgroundColor: "rgba(34,197,94,0.14)",
                          color: "#86efac",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: triggerRunning ? "wait" : "pointer",
                          opacity: triggerRunning ? 0.7 : 1,
                        }}
                      >
                        {triggerRunning ? "Running..." : "Run Now"}
                      </button>
                    </div>

                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      Saved schedules become real OpenClaw cron jobs named <code>{activePipeline.automation.cronJobName}</code>.
                      Manual runs use that job when it exists, otherwise they run the pipeline directly once.
                    </div>

                    {triggerFeedback ? (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "12px",
                          border:
                            triggerFeedback.tone === "success"
                              ? "1px solid rgba(34,197,94,0.22)"
                              : "1px solid rgba(248,113,113,0.22)",
                          backgroundColor:
                            triggerFeedback.tone === "success"
                              ? "rgba(21,128,61,0.12)"
                              : "rgba(127,29,29,0.2)",
                          color: triggerFeedback.tone === "success" ? "#86efac" : "#fecaca",
                          fontSize: "13px",
                        }}
                      >
                        {triggerFeedback.message}
                      </div>
                    ) : null}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Review Board"
                  subtitle="Notion should mirror the decisions you make here."
                >
                  <div style={{ display: "grid", gap: "12px" }}>
                    {activePipeline.output.board?.available ? (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                            gap: "10px",
                          }}
                        >
                          <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                              Status Property
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {activePipeline.output.board.propertyName || "Unknown"}
                            </div>
                          </div>
                          <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                              Tracked Items
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {activePipeline.output.board.totalPages ?? 0}
                            </div>
                          </div>
                          <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                              Last Notion Edit
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {formatTimestamp(activePipeline.output.board.lastEditedTime)}
                            </div>
                          </div>
                          <div style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--bg)" }}>
                            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "5px" }}>
                              Stage Alignment
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {activePipeline.output.board.aligned ? "Aligned" : "Needs cleanup"}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                            Live Notion statuses
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                              gap: "10px",
                            }}
                          >
                            {activePipeline.output.board.buckets.map((bucket) => {
                              const tone = notionColorStyle(bucket.color);

                              return (
                                <div
                                  key={bucket.name}
                                  style={{
                                    padding: "12px",
                                    borderRadius: "12px",
                                    backgroundColor: tone.backgroundColor,
                                    border: `1px solid ${tone.borderColor}`,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "10px",
                                      marginBottom: "6px",
                                    }}
                                  >
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: tone.color }}>{bucket.name}</div>
                                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{bucket.count}</div>
                                  </div>
                                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                    {bucket.expected ? "Expected pipeline stage" : "Extra Notion-only stage"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {activePipeline.output.board.missingExpectedStages.length > 0 ? (
                          <div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                              Missing expected stages in Notion
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              {activePipeline.output.board.missingExpectedStages.map((stage) => (
                                <InfoPill key={stage} icon={AlertTriangle} tone="warning" label={stage} />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {activePipeline.output.board.extraStages.length > 0 ? (
                          <div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                              Extra stages currently in Notion
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              {activePipeline.output.board.extraStages.map((stage) => (
                                <InfoPill key={stage} label={stage} tone="accent" />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : activePipeline.output.board?.error ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(127,29,29,0.2)",
                          border: "1px solid rgba(248,113,113,0.22)",
                          color: "#fecaca",
                          fontSize: "13px",
                        }}
                      >
                        <AlertTriangle size={15} />
                        {activePipeline.output.board.error}
                      </div>
                    ) : null}

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
                      {activePipeline.output.board?.available ? (
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                          The dashboard is now reading the live Notion board state, so these pipeline stages reflect the
                          actual status property and item counts in Notion.
                        </div>
                      ) : null}
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
                        {activePipeline.output.board ? (
                          <InfoPill
                            icon={Database}
                            tone={activePipeline.output.board.available ? "success" : "warning"}
                            label={
                              activePipeline.output.board.available
                                ? `${activePipeline.output.board.source === "database" ? "Database" : "Data source"} live`
                                : "Live Notion status unavailable"
                            }
                          />
                        ) : null}
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
