"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Circle,
  GitBranch,
  HardDrive,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { AgentHierarchy } from "@/components/AgentHierarchy";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  model: string;
  workspace: string;
  dmPolicy?: string;
  allowAgents: string[];
  allowAgentsDetails?: Array<{
    id: string;
    name: string;
    emoji: string;
    color: string;
  }>;
  botToken?: string;
  isDefault: boolean;
  skillsFilter: {
    mode: "all" | "allowlist";
    selectedCount: number;
  };
  status: "online" | "offline";
  lastActivity?: string;
  activeSessions: number;
}

interface SkillRequirements {
  bins: string[];
  env: string[];
  config: string[];
  os: string[];
}

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  enabledForAgent: boolean;
  missing: SkillRequirements;
}

interface AgentSkillsResponse {
  agent: {
    id: string;
    name: string;
    workspace: string;
    skillsFilter: {
      mode: "all" | "allowlist";
      selectedCount: number;
      selectedSkills: string[];
    };
  };
  report: {
    summary: {
      total: number;
      ready: number;
      blocked: number;
      disabled: number;
      selected: number;
      excluded: number;
    };
    skills: AgentSkill[];
  };
}

type AgentSkillsPanelState = {
  loading: boolean;
  error: string | null;
  data: AgentSkillsResponse | null;
};

function formatSkillMissing(skill: AgentSkill): string[] {
  return [
    ...skill.missing.bins.map((bin) => `bin:${bin}`),
    ...skill.missing.env.map((env) => `env:${env}`),
    ...skill.missing.config.map((config) => `config:${config}`),
    ...skill.missing.os.map((os) => `os:${os}`),
  ];
}

function formatSkillReasons(skill: AgentSkill): string[] {
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push("disabled");
  }
  if (skill.blockedByAllowlist) {
    reasons.push("blocked by allowlist");
  }
  return reasons;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"cards" | "hierarchy">("cards");
  const [openSkillsAgentId, setOpenSkillsAgentId] = useState<string | null>(null);
  const [agentSkills, setAgentSkills] = useState<Record<string, AgentSkillsPanelState>>({});

  useEffect(() => {
    void fetchAgents();
    const interval = setInterval(() => {
      void fetchAgents();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/agents", { cache: "no-store" });
      const data = (await response.json()) as { agents?: Agent[] };
      setAgents(data.agents || []);
    } catch (error) {
      console.error("Error fetching agents:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentSkills = async (agentId: string, force = false) => {
    const existing = agentSkills[agentId];
    if (existing?.loading) {
      return;
    }
    if (!force && existing?.data) {
      return;
    }

    setAgentSkills((current) => ({
      ...current,
      [agentId]: {
        loading: true,
        error: null,
        data: current[agentId]?.data || null,
      },
    }));

    try {
      const response = await fetch(`/api/agents/${agentId}/skills`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Agent skills API returned ${response.status}`);
      }
      const data = (await response.json()) as AgentSkillsResponse;
      setAgentSkills((current) => ({
        ...current,
        [agentId]: {
          loading: false,
          error: null,
          data,
        },
      }));
    } catch (error) {
      setAgentSkills((current) => ({
        ...current,
        [agentId]: {
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load agent skills",
          data: current[agentId]?.data || null,
        },
      }));
    }
  };

  const toggleSkillsPanel = async (agentId: string) => {
    const nextAgentId = openSkillsAgentId === agentId ? null : agentId;
    setOpenSkillsAgentId(nextAgentId);
    if (nextAgentId) {
      await fetchAgentSkills(nextAgentId);
    }
  };

  const formatLastActivity = (timestamp?: string) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-lg" style={{ color: "var(--text-muted)" }}>
            Loading agents...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-2"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--text-primary)",
            letterSpacing: "-1.5px",
          }}
        >
          <Users className="inline-block w-8 h-8 mr-2 mb-1" />
          Agents
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Multi-agent system overview with per-agent OpenClaw skills visibility
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
        {[
          { id: "cards" as const, label: "Agent Cards", icon: LayoutGrid },
          { id: "hierarchy" as const, label: "Hierarchy", icon: GitBranch },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2 font-medium transition-all"
            style={{
              color: activeTab === id ? "var(--accent)" : "var(--text-secondary)",
              backgroundColor: "transparent",
              borderTopWidth: 0,
              borderRightWidth: 0,
              borderLeftWidth: 0,
              borderBottomStyle: "solid",
              borderBottomWidth: "2px",
              borderBottomColor: activeTab === id ? "var(--accent)" : "transparent",
              cursor: "pointer",
              paddingBottom: "0.5rem",
            }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "hierarchy" ? (
        <div className="rounded-xl" style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Agent Hierarchy
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Visualization of agent communication allowances
            </p>
          </div>
          <AgentHierarchy agents={agents} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const skillsState = agentSkills[agent.id];
            const skillsOpen = openSkillsAgentId === agent.id;

            return (
              <div
                key={agent.id}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="px-5 py-4 flex items-center justify-between"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: `linear-gradient(135deg, ${agent.color}15, transparent)`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{
                        backgroundColor: `${agent.color}20`,
                        border: `2px solid ${agent.color}`,
                      }}
                    >
                      {agent.emoji}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className="text-lg font-bold"
                          style={{
                            fontFamily: "var(--font-heading)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {agent.name}
                        </h3>
                        {agent.isDefault ? (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "999px",
                              fontSize: "10px",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              backgroundColor: `${agent.color}20`,
                              color: agent.color,
                              border: `1px solid ${agent.color}40`,
                            }}
                          >
                            default
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Circle
                          className="w-2 h-2"
                          style={{
                            fill: agent.status === "online" ? "#4ade80" : "#6b7280",
                            color: agent.status === "online" ? "#4ade80" : "#6b7280",
                          }}
                        />
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: agent.status === "online" ? "#4ade80" : "var(--text-muted)",
                          }}
                        >
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {agent.botToken ? (
                    <div title="Telegram Bot Connected">
                      <MessageSquare className="w-5 h-5" style={{ color: "#0088cc" }} />
                    </div>
                  ) : null}
                </div>

                <div className="p-5 space-y-4">
                  <InfoRow icon={Bot} color={agent.color} label="Model" value={agent.model} mono />
                  <InfoRow icon={HardDrive} color={agent.color} label="Workspace" value={agent.workspace} mono title={agent.workspace} />
                  {agent.dmPolicy ? <InfoRow icon={Shield} color={agent.color} label="DM Policy" value={agent.dmPolicy} /> : null}
                  <InfoRow
                    icon={CheckCircle2}
                    color={agent.color}
                    label="Skills Filter"
                    value={
                      agent.skillsFilter.mode === "allowlist"
                        ? `${agent.skillsFilter.selectedCount} selected`
                        : "all skills"
                    }
                  />

                  {agent.allowAgents.length > 0 ? (
                    <div className="flex items-start gap-3">
                      <Users className="w-4 h-4 mt-0.5" style={{ color: agent.color }} />
                      <div className="flex-1">
                        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                          Can spawn subagents ({agent.allowAgents.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {agent.allowAgentsDetails && agent.allowAgentsDetails.length > 0
                            ? agent.allowAgentsDetails.map((subagent) => (
                                <div
                                  key={subagent.id}
                                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                                  style={{
                                    backgroundColor: `${subagent.color}15`,
                                    border: `1px solid ${subagent.color}40`,
                                  }}
                                  title={`${subagent.name} (${subagent.id})`}
                                >
                                  <span className="text-sm">{subagent.emoji}</span>
                                  <span style={{ color: subagent.color, fontWeight: 600 }}>{subagent.name}</span>
                                </div>
                              ))
                            : agent.allowAgents.map((subagent) => (
                                <span
                                  key={subagent}
                                  className="text-xs px-2 py-1 rounded"
                                  style={{
                                    backgroundColor: `${agent.color}20`,
                                    color: agent.color,
                                    fontWeight: 500,
                                  }}
                                >
                                  {subagent}
                                </span>
                              ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      paddingTop: "12px",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Last activity: {formatLastActivity(agent.lastActivity)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {agent.activeSessions > 0 ? (
                        <span
                          className="text-xs font-medium px-2 py-1 rounded"
                          style={{
                            backgroundColor: "var(--success)20",
                            color: "var(--success)",
                          }}
                        >
                          {agent.activeSessions} active
                        </span>
                      ) : null}
                      <button
                        onClick={() => void toggleSkillsPanel(agent.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          backgroundColor: "var(--surface-elevated)",
                          border: "1px solid var(--border)",
                          color: "var(--text-primary)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        {skillsOpen ? "Hide Skills" : "View Skills"}
                      </button>
                    </div>
                  </div>

                  {skillsOpen ? (
                    <AgentSkillsPanel
                      agent={agent}
                      state={skillsState || { loading: true, error: null, data: null }}
                      onRefresh={() => void fetchAgentSkills(agent.id, true)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  color,
  label,
  value,
  mono = false,
  title,
}: {
  icon: typeof Bot;
  color: string;
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 mt-0.5" style={{ color }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
        <div
          className={mono ? "text-sm font-mono truncate" : "text-sm font-medium"}
          style={{ color: "var(--text-primary)" }}
          title={title}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function AgentSkillsPanel({
  agent,
  state,
  onRefresh,
}: {
  agent: Agent;
  state: AgentSkillsPanelState;
  onRefresh: () => void;
}) {
  const data = state.data;

  return (
    <div
      style={{
        marginTop: "16px",
        paddingTop: "16px",
        borderTop: "1px solid var(--border)",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div>
          <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "14px" }}>Skills</div>
          <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.6 }}>
            Checked means the agent can use it. Eligible means the gateway says it is runnable.
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={state.loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 10px",
            borderRadius: "8px",
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw className={state.loading ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
          Refresh
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "8px",
        }}
      >
        <SummaryTile
          label="Skills Filter"
          value={
            agent.skillsFilter.mode === "allowlist"
              ? `${agent.skillsFilter.selectedCount} selected`
              : "all skills"
          }
        />
        <SummaryTile label="Ready" value={String(data?.report.summary.ready ?? "...")} />
        <SummaryTile label="Blocked" value={String(data?.report.summary.blocked ?? "...")} />
        <SummaryTile label="Excluded" value={String(data?.report.summary.excluded ?? "...")} />
      </div>

      {state.error ? (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.24)",
            borderRadius: "12px",
            padding: "12px",
            color: "#fca5a5",
            fontSize: "12px",
          }}
        >
          {state.error}
        </div>
      ) : null}

      {state.loading && !data ? (
        <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Loading skills…</div>
      ) : data ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "0",
              maxHeight: "420px",
              overflowY: "auto",
            }}
          >
            {data.report.skills
              .slice()
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((skill) => {
                const missing = formatSkillMissing(skill);
                const reasons = formatSkillReasons(skill);
                return (
                  <div
                    key={skill.id}
                    style={{
                      padding: "12px 14px",
                      borderTop: "1px solid var(--border)",
                      backgroundColor: "var(--surface-elevated)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={skill.enabledForAgent}
                        readOnly
                        style={{ marginTop: "3px" }}
                        aria-label={`${skill.name} enabled for ${agent.name}`}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "13px" }}>
                            {skill.name}
                          </div>
                          <SkillChip label={skill.source} tone="neutral" />
                          <SkillChip label={skill.eligible ? "eligible" : "blocked"} tone={skill.eligible ? "ready" : "blocked"} />
                          {!skill.enabledForAgent ? <SkillChip label="excluded" tone="disabled" /> : null}
                          {skill.disabled ? <SkillChip label="disabled" tone="disabled" /> : null}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px", lineHeight: 1.6 }}>
                          {skill.description}
                        </div>
                        {!skill.enabledForAgent && skill.eligible ? (
                          <div style={{ color: "#fcd34d", fontSize: "12px", marginTop: "6px", lineHeight: 1.6 }}>
                            Ready on the gateway, but excluded by this agent&apos;s allowlist.
                          </div>
                        ) : null}
                        {missing.length > 0 ? (
                          <div style={{ color: "#fbbf24", fontSize: "12px", marginTop: "6px", lineHeight: 1.6 }}>
                            Missing: {missing.join(", ")}
                          </div>
                        ) : null}
                        {reasons.length > 0 ? (
                          <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "6px", lineHeight: 1.6 }}>
                            Reason: {reasons.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "10px 12px",
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 700, marginTop: "4px" }}>{value}</div>
    </div>
  );
}

function SkillChip({
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
          : { background: "var(--surface)", color: "var(--text-muted)", border: "var(--border)" };

  return (
    <span
      style={{
        padding: "3px 8px",
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
