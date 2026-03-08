import fs from "fs";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";
import { getMemoryStackSnapshot, type WorkspaceMemoryBackend } from "@/lib/memory-stack";
import { extractNotionResourceId, getNotionBoardSnapshot, type NotionBoardSnapshot } from "@/lib/notion";
import { OPENCLAW_CRON_JOBS } from "@/lib/openclaw-runtime";

type PipelineDomain = "internships" | "housing";
type PipelineStatus = "ready" | "attention" | "draft";
type GraphRequirement = "required" | "optional" | "none";

interface CronJobRecord extends Record<string, unknown> {
  id?: string;
  agentId?: string;
  name?: string;
  enabled?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

interface PipelineBlueprint {
  id: string;
  emoji: string;
  name: string;
  domain: PipelineDomain;
  description: string;
  agentId: string;
  workspaceId: string;
  graphRequirement: GraphRequirement;
  triggerMode: "cron";
  recommendedSchedule: string;
  recommendedCronExpr: string;
  recommendedTimezone: string;
  cronJobName: string;
  sessionId: string;
  triggerPrompt: string;
  cronMatchTerms: string[];
  searchTemplates: string[];
  stages: string[];
  reviewColumns: string[];
  boardFields: string[];
  rules: string[];
  graphQueries: string[];
  outputLabel: string;
  databaseEnvKeys: string[];
  integrationNote: string;
}

export interface CronJobSummary {
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

interface PipelineWorkspaceStatus {
  workspaceId: string;
  workspaceName: string;
  workspaceEmoji: string;
  backendLabel: string;
  serviceName: string | null;
  graphEnabled: boolean;
  health: string;
}

export interface PipelineSnapshot {
  id: string;
  emoji: string;
  name: string;
  domain: PipelineDomain;
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

export interface PipelineDashboardSnapshot {
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

export interface PipelineTriggerConfig {
  id: string;
  name: string;
  agentId: string;
  cronJobName: string;
  sessionId: string;
  prompt: string;
  description: string;
  recommendedCronExpr: string;
  recommendedTimezone: string;
}

const PIPELINE_BLUEPRINTS: PipelineBlueprint[] = [
  {
    id: "internship-radar",
    emoji: "💼",
    name: "Internship Radar",
    domain: "internships",
    description:
      "Search for internships, score fit, dedupe repeat listings, and send approved leads into a Notion pipeline.",
    agentId: "coding",
    workspaceId: "workspace-coding",
    graphRequirement: "required",
    triggerMode: "cron",
    recommendedSchedule: "Weekdays at 08:00 and 18:00",
    recommendedCronExpr: "0 8,18 * * 1-5",
    recommendedTimezone: "America/Los_Angeles",
    cronJobName: "pipeline:internship-radar",
    sessionId: "pipeline-internship-radar",
    triggerPrompt:
      "Run the Internship Radar pipeline. Search for new internships using the configured templates, deduplicate repeats, score fit, update memory context, and prepare approved-ready changes for the Notion internships board. End with a concise summary of findings, decisions, and follow-up items.",
    cronMatchTerms: ["internship", "career", "job hunt", "new grad"],
    searchTemplates: [
      "software engineer internship summer 2027 remote",
      "product internship san francisco summer 2027",
      "computer science internship california early career",
    ],
    stages: [
      "Discover listings from curated job sources",
      "Score each role against your skills, location, and timing",
      "Use GraphRAG to relate company, recruiter, alumni, and stack signals",
      "Queue only strong leads for review",
      "Write approved rows into Notion",
    ],
    reviewColumns: ["Found", "Scored", "Ready to Apply", "Applied", "Waiting"],
    boardFields: ["Company", "Role", "Location", "Deadline", "Fit score", "Referral edge", "Status"],
    rules: [
      "Deduplicate by company + role + location + apply URL",
      "Do not auto-apply; require approval before external submission",
      "Record why a role was rejected to refine later scoring",
    ],
    graphQueries: [
      "frontend internship referrals",
      "companies using react and typescript",
      "alumni or recruiter links for top roles",
    ],
    outputLabel: "Notion internships database",
    databaseEnvKeys: ["NOTION_INTERNSHIPS_DATABASE_ID", "NOTION_JOBS_DATABASE_ID", "NOTION_DATABASE_ID"],
    integrationNote: "Use Notion as the source of truth for live application tracking.",
  },
  {
    id: "housing-radar",
    emoji: "🏠",
    name: "Housing Radar",
    domain: "housing",
    description:
      "Monitor next-year housing options, rank listings by budget and commute, and push shortlisted places into Notion.",
    agentId: "main",
    workspaceId: "workspace",
    graphRequirement: "optional",
    triggerMode: "cron",
    recommendedSchedule: "Daily at 09:00 and 19:00",
    recommendedCronExpr: "0 9,19 * * *",
    recommendedTimezone: "America/Los_Angeles",
    cronJobName: "pipeline:housing-radar",
    sessionId: "pipeline-housing-radar",
    triggerPrompt:
      "Run the Housing Radar pipeline. Search for housing options using the configured templates, filter by budget and lease timing, cluster duplicates, update preference memory, and prepare shortlist updates for the Notion housing board. End with a concise summary of promising listings and next steps.",
    cronMatchTerms: ["housing", "apartment", "lease", "rent", "zillow"],
    searchTemplates: [
      "san luis obispo 4 bedroom lease august 2027",
      "slo student housing pet friendly",
      "apartments near cal poly under budget",
    ],
    stages: [
      "Collect listings from approved housing sources",
      "Filter on rent, lease window, commute, and roommate fit",
      "Cluster duplicates across syndication sites",
      "Queue promising options for contact and tour planning",
      "Sync approved shortlist entries into Notion",
    ],
    reviewColumns: ["Found", "Contacted", "Touring", "Shortlist", "Decision"],
    boardFields: ["Address", "Rent", "Beds/Baths", "Lease start", "Commute", "Risk notes", "Status"],
    rules: [
      "Reject listings outside your budget or lease window before review",
      "Keep landlord contact and notes in Notion, not only memory",
      "If neighborhood or landlord relations become important, move this pipeline to a graph-backed workspace",
    ],
    graphQueries: [
      "landlord relationships by neighborhood",
      "duplicate listings across sites",
      "housing options near campus with similar rent bands",
    ],
    outputLabel: "Notion housing database",
    databaseEnvKeys: ["NOTION_HOUSING_DATABASE_ID", "NOTION_APARTMENTS_DATABASE_ID", "NOTION_DATABASE_ID"],
    integrationNote: "Vector memory is fine for preferences; Notion should own the actual listing tracker.",
  },
];

const NOTION_TOKEN_KEYS = ["NOTION_TOKEN", "NOTION_API_KEY"];

function readCronJobs(): CronJobRecord[] {
  if (fs.existsSync(OPENCLAW_CRON_JOBS)) {
    const parsed = JSON.parse(fs.readFileSync(OPENCLAW_CRON_JOBS, "utf-8")) as {
      jobs?: CronJobRecord[];
    };
    return parsed.jobs || [];
  }

  const data = tryRunOpenClawJson<{ jobs?: CronJobRecord[] }>(["cron", "list", "--json", "--all"], 10000);
  return data?.jobs || [];
}

function formatSchedule(schedule?: Record<string, unknown>): string {
  if (!schedule) {
    return "Unknown";
  }

  switch (schedule.kind) {
    case "cron":
      return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
    case "every": {
      const everyMs = Number(schedule.everyMs || 0);
      if (everyMs >= 3600000) {
        return `Every ${everyMs / 3600000}h`;
      }
      if (everyMs >= 60000) {
        return `Every ${everyMs / 60000}m`;
      }
      return `Every ${everyMs / 1000}s`;
    }
    case "at":
      return `Once at ${schedule.at}`;
    default:
      return JSON.stringify(schedule);
  }
}

function mapCronJobs(rawJobs: CronJobRecord[]): CronJobSummary[] {
  return rawJobs.map((job) => ({
    id: String(job.id || "unknown"),
    name: String(job.name || job.id || "Unnamed"),
    enabled: job.enabled ?? true,
    scheduleDisplay: formatSchedule(job.schedule),
    scheduleKind: typeof job.schedule?.kind === "string" ? String(job.schedule.kind) : null,
    cronExpr: typeof job.schedule?.expr === "string" ? String(job.schedule.expr) : null,
    timezone: typeof job.schedule?.tz === "string" && job.schedule.tz ? String(job.schedule.tz) : null,
    nextRun: (job.state as Record<string, number> | undefined)?.nextRunAtMs
      ? new Date((job.state as Record<string, number>).nextRunAtMs).toISOString()
      : null,
    lastRun: (job.state as Record<string, number> | undefined)?.lastRunAtMs
      ? new Date((job.state as Record<string, number>).lastRunAtMs).toISOString()
      : null,
  }));
}

function previewSecret(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function firstEnv(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return null;
}

function workspaceSummary(workspace: WorkspaceMemoryBackend | undefined | null): PipelineWorkspaceStatus | null {
  if (!workspace) {
    return null;
  }

  return {
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceEmoji: workspace.workspaceEmoji,
    backendLabel: workspace.backendLabel,
    serviceName: workspace.serviceName,
    graphEnabled: workspace.graphEnabled,
    health: workspace.health?.reachable ? "connected" : workspace.health?.composeStatus || "config only",
  };
}

function findLinkedJob(blueprint: PipelineBlueprint, jobs: CronJobSummary[]): CronJobSummary | null {
  const exactMatch = jobs.find((job) => job.name === blueprint.cronJobName);
  if (exactMatch) {
    return exactMatch;
  }

  const matches = jobs.filter((job) => {
    const haystack = `${job.id} ${job.name}`.toLowerCase();
    return blueprint.cronMatchTerms.some((term) => haystack.includes(term));
  });

  if (matches.length === 0) {
    return null;
  }

  return matches.find((job) => job.enabled) || matches[0];
}

function getBlueprintById(pipelineId: string): PipelineBlueprint | null {
  return PIPELINE_BLUEPRINTS.find((blueprint) => blueprint.id === pipelineId) || null;
}

export function getPipelineTriggerConfig(pipelineId: string): PipelineTriggerConfig | null {
  const blueprint = getBlueprintById(pipelineId);
  if (!blueprint) {
    return null;
  }

  return {
    id: blueprint.id,
    name: blueprint.name,
    agentId: blueprint.agentId,
    cronJobName: blueprint.cronJobName,
    sessionId: blueprint.sessionId,
    prompt: blueprint.triggerPrompt,
    description: blueprint.description,
    recommendedCronExpr: blueprint.recommendedCronExpr,
    recommendedTimezone: blueprint.recommendedTimezone,
  };
}

export function getLinkedPipelineJob(pipelineId: string): CronJobSummary | null {
  const blueprint = getBlueprintById(pipelineId);
  if (!blueprint) {
    return null;
  }

  return findLinkedJob(blueprint, mapCronJobs(readCronJobs()));
}

async function getPipelineOutput(blueprint: PipelineBlueprint): Promise<PipelineOutputStatus> {
  const notionToken = firstEnv(NOTION_TOKEN_KEYS);
  const database = firstEnv(blueprint.databaseEnvKeys);
  const databaseId = extractNotionResourceId(database?.value);
  const configured = Boolean(notionToken && databaseId);
  const board =
    configured && notionToken && databaseId
      ? await getNotionBoardSnapshot({
          token: notionToken.value,
          databaseId,
          expectedStages: blueprint.reviewColumns,
        })
      : null;

  return {
    provider: "notion",
    label: blueprint.outputLabel,
    configured,
    tokenConfigured: Boolean(notionToken),
    databaseConfigured: Boolean(databaseId),
    databaseKey: database?.key || null,
    databaseValuePreview: previewSecret(databaseId || database?.value || null),
    syncMode: "approval",
    note: blueprint.integrationNote,
    board,
  };
}

function getStatus(
  blueprint: PipelineBlueprint,
  workspace: WorkspaceMemoryBackend | undefined,
  linkedJob: CronJobSummary | null,
  output: PipelineOutputStatus
): { status: PipelineStatus; reason: string } {
  if (!workspace) {
    return {
      status: "draft",
      reason: "Assigned workspace is not available in the current OpenClaw config.",
    };
  }

  if (!linkedJob) {
    return {
      status: "draft",
      reason: `No cron job is linked yet. Recommended schedule: ${blueprint.recommendedSchedule}.`,
    };
  }

  if (blueprint.graphRequirement === "required" && !workspace.graphEnabled) {
    return {
      status: "attention",
      reason: "This pipeline expects a graph-backed workspace, but the assigned workspace is vector-only.",
    };
  }

  if (!output.configured) {
    return {
      status: "attention",
      reason: "Notion is not fully configured yet, so approved items have nowhere durable to sync.",
    };
  }

  if (output.board && !output.board.available) {
    return {
      status: "attention",
      reason: output.board.error || "The Notion board is configured, but the dashboard could not read its live status.",
    };
  }

  if (!linkedJob.enabled) {
    return {
      status: "attention",
      reason: "A cron job is linked, but it is currently disabled.",
    };
  }

  return {
    status: "ready",
    reason: "Scheduler, memory backend, and approval-first output path are all in place.",
  };
}

export async function getPipelineDashboardSnapshot(): Promise<PipelineDashboardSnapshot> {
  const memoryStack = getMemoryStackSnapshot();
  const jobs = mapCronJobs(readCronJobs());

  const pipelines = await Promise.all(PIPELINE_BLUEPRINTS.map(async (blueprint) => {
    const workspace = memoryStack.workspaces.find((entry) => entry.workspaceId === blueprint.workspaceId);
    const linkedJob = findLinkedJob(blueprint, jobs);
    const output = await getPipelineOutput(blueprint);
    const status = getStatus(blueprint, workspace, linkedJob, output);

    return {
      id: blueprint.id,
      emoji: blueprint.emoji,
      name: blueprint.name,
      domain: blueprint.domain,
      description: blueprint.description,
      status: status.status,
      statusReason: status.reason,
      workspace: workspaceSummary(workspace),
      graphRequirement: blueprint.graphRequirement,
      automation: {
        mode: blueprint.triggerMode,
        recommendedSchedule: blueprint.recommendedSchedule,
        recommendedCronExpr: blueprint.recommendedCronExpr,
        recommendedTimezone: blueprint.recommendedTimezone,
        cronJobName: blueprint.cronJobName,
        agentId: blueprint.agentId,
        sessionId: blueprint.sessionId,
        linkedJob,
      },
      output,
      searchTemplates: blueprint.searchTemplates,
      stages: blueprint.stages,
      reviewColumns: output.board?.statusOptions.length ? output.board.statusOptions : blueprint.reviewColumns,
      boardFields: blueprint.boardFields,
      rules: blueprint.rules,
      graphQueries: blueprint.graphQueries,
    } satisfies PipelineSnapshot;
  }));

  const ready = pipelines.filter((pipeline) => pipeline.status === "ready").length;
  const attention = pipelines.filter((pipeline) => pipeline.status === "attention").length;
  const scheduled = pipelines.filter((pipeline) => Boolean(pipeline.automation.linkedJob?.enabled)).length;
  const notionReady = pipelines.filter((pipeline) => pipeline.output.board?.available).length;
  const graphReady = pipelines.filter((pipeline) => pipeline.workspace?.graphEnabled).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: pipelines.length,
      ready,
      attention,
      scheduled,
      notionReady,
      graphReady,
    },
    stack: {
      mainWorkspace: workspaceSummary(memoryStack.workspaces.find((workspace) => workspace.workspaceId === "workspace")),
      graphWorkspace:
        workspaceSummary(memoryStack.workspaces.find((workspace) => workspace.graphEnabled)) || null,
      neo4jStatus: memoryStack.neo4jStatus,
    },
    pipelines,
  };
}
