import fs from "fs";
import path from "path";
import readline from "readline";
import { OPENCLAW_AGENTS_DIR } from "./openclaw-runtime";
import { calculateCost, normalizeModelId } from "./pricing";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const TRANSCRIPT_FILE_PATTERN = /\.jsonl(?:\.|$)/;

interface UsageCostBreakdown {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

interface UsagePayload {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: UsageCostBreakdown;
}

interface TranscriptMessage {
  role?: string;
  provider?: string;
  model?: string;
  usage?: UsagePayload;
  timestamp?: unknown;
}

interface TranscriptRecord {
  type?: string;
  timestamp?: unknown;
  provider?: string;
  model?: string;
  usage?: UsagePayload;
  message?: TranscriptMessage;
}

interface TranscriptFileInfo {
  agentId: string;
  filePath: string;
  mtimeMs: number;
  size: number;
}

interface UsageEvent {
  timestamp: number;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

interface AggregateBucket {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface DashboardBreakdown {
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  percentOfTotal: number;
}

let cachedEvents:
  | {
      fingerprint: string;
      events: UsageEvent[];
    }
  | null = null;

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getLocalDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getLocalHourStart(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    0,
    0,
    0
  ).getTime();
}

function formatLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHourLabel(timestamp: number): string {
  return `${String(new Date(timestamp).getHours()).padStart(2, "0")}:00`;
}

function buildFingerprint(files: TranscriptFileInfo[]): string {
  return files
    .map((file) => `${file.filePath}:${file.mtimeMs}:${file.size}`)
    .join("|");
}

function listTranscriptFiles(): TranscriptFileInfo[] {
  if (!fs.existsSync(OPENCLAW_AGENTS_DIR)) {
    return [];
  }

  const agentEntries = fs.readdirSync(OPENCLAW_AGENTS_DIR, { withFileTypes: true });
  const files: TranscriptFileInfo[] = [];

  for (const agentEntry of agentEntries) {
    if (!agentEntry.isDirectory()) {
      continue;
    }

    const agentId = agentEntry.name;
    const sessionsDir = path.join(OPENCLAW_AGENTS_DIR, agentId, "sessions");
    if (!fs.existsSync(sessionsDir)) {
      continue;
    }

    const sessionEntries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isFile() || !TRANSCRIPT_FILE_PATTERN.test(sessionEntry.name)) {
        continue;
      }

      const filePath = path.join(sessionsDir, sessionEntry.name);
      const stat = fs.statSync(filePath);
      files.push({
        agentId,
        filePath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    }
  }

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function parseTimestamp(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = new Date(candidate).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function resolveModelId(record: TranscriptRecord, message?: TranscriptMessage): string {
  const rawModel =
    (typeof message?.model === "string" && message.model.trim()) ||
    (typeof record.model === "string" && record.model.trim()) ||
    "unknown";

  return normalizeModelId(rawModel);
}

function resolveCost(model: string, usage: UsagePayload): number {
  const explicitTotal = toFiniteNumber(usage.cost?.total);
  if (explicitTotal > 0) {
    return explicitTotal;
  }

  const breakdownTotal =
    toFiniteNumber(usage.cost?.input) +
    toFiniteNumber(usage.cost?.output) +
    toFiniteNumber(usage.cost?.cacheRead) +
    toFiniteNumber(usage.cost?.cacheWrite);

  if (breakdownTotal > 0) {
    return breakdownTotal;
  }

  return calculateCost(
    model,
    toFiniteNumber(usage.input),
    toFiniteNumber(usage.output),
    toFiniteNumber(usage.cacheRead),
    toFiniteNumber(usage.cacheWrite)
  );
}

function parseUsageEvent(record: TranscriptRecord, agentId: string): UsageEvent | null {
  const message = record.message;
  const usage = message?.usage || record.usage;
  if (!usage) {
    return null;
  }

  const timestamp = parseTimestamp(record.timestamp, message?.timestamp);
  if (timestamp === null) {
    return null;
  }

  const inputTokens = toFiniteNumber(usage.input);
  const outputTokens = toFiniteNumber(usage.output);
  const cacheReadTokens = toFiniteNumber(usage.cacheRead);
  const cacheWriteTokens = toFiniteNumber(usage.cacheWrite);
  const totalTokens =
    toFiniteNumber(usage.totalTokens) ||
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const model = resolveModelId(record, message);
  const cost = resolveCost(model, usage);

  return {
    timestamp,
    agentId,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    cost,
  };
}

async function readUsageEvents(file: TranscriptFileInfo): Promise<UsageEvent[]> {
  const events: UsageEvent[] = [];
  const stream = fs.createReadStream(file.filePath, { encoding: "utf-8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      try {
        const record = JSON.parse(line) as TranscriptRecord;
        const event = parseUsageEvent(record, file.agentId);
        if (event) {
          events.push(event);
        }
      } catch {
        // Ignore malformed transcript lines so one bad record does not break the dashboard.
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return events;
}

async function loadUsageEvents(): Promise<UsageEvent[]> {
  const files = listTranscriptFiles();
  const fingerprint = buildFingerprint(files);

  if (cachedEvents?.fingerprint === fingerprint) {
    return cachedEvents.events;
  }

  const events: UsageEvent[] = [];
  for (const file of files) {
    events.push(...(await readUsageEvents(file)));
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  cachedEvents = { fingerprint, events };
  return events;
}

function createAggregateBucket(): AggregateBucket {
  return {
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addEventToBucket(bucket: AggregateBucket, event: UsageEvent): void {
  bucket.cost += event.cost;
  bucket.inputTokens += event.inputTokens;
  bucket.outputTokens += event.outputTokens;
  bucket.totalTokens += event.totalTokens;
}

function toBreakdownEntries(
  data: Map<string, AggregateBucket>,
  keyName: "agent" | "model"
): Array<Record<"agent" | "model", string> & DashboardBreakdown> {
  const rows = Array.from(data.entries()).map(([key, bucket]) => ({
    [keyName]: key,
    cost: roundCurrency(bucket.cost),
    tokens: bucket.totalTokens,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    percentOfTotal: 0,
  })) as Array<Record<"agent" | "model", string> & DashboardBreakdown>;

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);

  return rows
    .map((row) => ({
      ...row,
      percentOfTotal: totalCost > 0 ? (row.cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export async function loadCostDashboardData(days: number, budget: number) {
  const events = await loadUsageEvents();
  const now = new Date();
  const nowMs = now.getTime();
  const todayStart = getLocalDayStart(now);
  const yesterdayStart = todayStart - DAY_MS;
  const tomorrowStart = todayStart + DAY_MS;
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const byTimeframeStart = todayStart - (Math.max(1, days) - 1) * DAY_MS;
  const hourlyStart = getLocalHourStart(now) - 23 * HOUR_MS;

  let today = 0;
  let yesterday = 0;
  let thisMonth = 0;
  let lastMonth = 0;

  const byAgent = new Map<string, AggregateBucket>();
  const byModel = new Map<string, AggregateBucket>();
  const dailyBuckets = new Map<string, AggregateBucket>();
  const hourlyBuckets = new Map<number, number>();

  for (const event of events) {
    if (event.timestamp >= todayStart && event.timestamp < tomorrowStart) {
      today += event.cost;
    }

    if (event.timestamp >= yesterdayStart && event.timestamp < todayStart) {
      yesterday += event.cost;
    }

    if (event.timestamp >= thisMonthStart) {
      thisMonth += event.cost;
    } else if (event.timestamp >= lastMonthStart && event.timestamp < thisMonthStart) {
      lastMonth += event.cost;
    }

    if (event.timestamp >= byTimeframeStart) {
      const agentBucket = byAgent.get(event.agentId) || createAggregateBucket();
      addEventToBucket(agentBucket, event);
      byAgent.set(event.agentId, agentBucket);

      const modelBucket = byModel.get(event.model) || createAggregateBucket();
      addEventToBucket(modelBucket, event);
      byModel.set(event.model, modelBucket);

      const dateKey = formatLocalDateKey(event.timestamp);
      const dailyBucket = dailyBuckets.get(dateKey) || createAggregateBucket();
      addEventToBucket(dailyBucket, event);
      dailyBuckets.set(dateKey, dailyBucket);
    }

    if (event.timestamp >= hourlyStart) {
      const hourStart = getLocalHourStart(new Date(event.timestamp));
      hourlyBuckets.set(hourStart, (hourlyBuckets.get(hourStart) || 0) + event.cost);
    }
  }

  const daily = Array.from({ length: Math.max(1, days) }, (_, index) => {
    const dayStart = byTimeframeStart + index * DAY_MS;
    const dateKey = formatLocalDateKey(dayStart);
    const bucket = dailyBuckets.get(dateKey) || createAggregateBucket();

    return {
      date: dateKey.slice(5),
      cost: roundCurrency(bucket.cost),
      input: bucket.inputTokens,
      output: bucket.outputTokens,
    };
  });

  const hourly = Array.from({ length: 24 }, (_, index) => {
    const hourStart = hourlyStart + index * HOUR_MS;
    return {
      hour: formatHourLabel(hourStart),
      cost: roundCurrency(hourlyBuckets.get(hourStart) || 0),
    };
  });

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, now.getDate());
  const projected = (thisMonth / daysElapsed) * daysInMonth;

  return {
    today: roundCurrency(today),
    yesterday: roundCurrency(yesterday),
    thisMonth: roundCurrency(thisMonth),
    lastMonth: roundCurrency(lastMonth),
    projected: roundCurrency(projected),
    budget,
    byAgent: toBreakdownEntries(byAgent, "agent"),
    byModel: toBreakdownEntries(byModel, "model"),
    daily,
    hourly,
    updatedAt: nowMs,
    source: "openclaw-session-logs",
    message:
      events.length > 0
        ? undefined
        : "No OpenClaw session usage found yet.",
  };
}
