import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import readline from "readline";
import { OPENCLAW_AGENTS_DIR } from "./openclaw-runtime";
import { calculateCost, normalizeModelId } from "./pricing";

const DB_PATH = path.join(process.cwd(), "data", "usage-ledger.db");
const TRANSCRIPT_FILE_PATTERN = /\.jsonl$/;

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
  id?: string;
  role?: string;
  provider?: string;
  model?: string;
  usage?: UsagePayload;
  timestamp?: unknown;
}

interface TranscriptRecord {
  id?: string;
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

interface LedgerInsertEvent {
  eventKey: string;
  sourceFile: string;
  sourceLine: number;
  agentId: string;
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface UsageEvent {
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

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) {
    return db;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      event_key TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      source_line INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cache_write_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      imported_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_events_agent ON usage_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model);

    CREATE TABLE IF NOT EXISTS usage_sources (
      source_file TEXT PRIMARY KEY,
      last_size INTEGER NOT NULL,
      last_mtime_ms INTEGER NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  return db;
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

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function parseUsageEvent(record: TranscriptRecord, file: TranscriptFileInfo, sourceLine: number): LedgerInsertEvent | null {
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
    eventKey: `${file.filePath}:${sourceLine}`,
    sourceFile: file.filePath,
    sourceLine,
    agentId: file.agentId,
    timestamp,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    cost,
  };
}

async function readLedgerEventsFromFile(file: TranscriptFileInfo): Promise<LedgerInsertEvent[]> {
  const events: LedgerInsertEvent[] = [];
  const stream = fs.createReadStream(file.filePath, { encoding: "utf-8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let sourceLine = 0;

  try {
    for await (const line of reader) {
      sourceLine += 1;
      if (!line.trim()) {
        continue;
      }

      try {
        const record = JSON.parse(line) as TranscriptRecord;
        const event = parseUsageEvent(record, file, sourceLine);
        if (event) {
          events.push(event);
        }
      } catch {
        // Ignore malformed transcript lines so one bad line does not break syncing.
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return events;
}

export async function syncUsageLedger(): Promise<void> {
  const database = getDb();
  const files = listTranscriptFiles();

  const getSourceState = database.prepare(
    "SELECT last_size, last_mtime_ms FROM usage_sources WHERE source_file = ?"
  );
  const insertEvent = database.prepare(`
    INSERT OR IGNORE INTO usage_events (
      event_key,
      source_file,
      source_line,
      agent_id,
      timestamp,
      model,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
      total_tokens,
      cost,
      imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteSourceEvents = database.prepare(
    "DELETE FROM usage_events WHERE source_file = ?"
  );
  const upsertSource = database.prepare(`
    INSERT INTO usage_sources (source_file, last_size, last_mtime_ms, synced_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_file) DO UPDATE SET
      last_size = excluded.last_size,
      last_mtime_ms = excluded.last_mtime_ms,
      synced_at = excluded.synced_at
  `);

  for (const file of files) {
    const sourceState = getSourceState.get(file.filePath) as
      | { last_size: number; last_mtime_ms: number }
      | undefined;
    if (
      sourceState &&
      sourceState.last_size === file.size &&
      sourceState.last_mtime_ms === file.mtimeMs
    ) {
      continue;
    }

    const events = await readLedgerEventsFromFile(file);
    const importedAt = Date.now();

    const commit = database.transaction(() => {
      deleteSourceEvents.run(file.filePath);

      for (const event of events) {
        insertEvent.run(
          event.eventKey,
          event.sourceFile,
          event.sourceLine,
          event.agentId,
          event.timestamp,
          event.model,
          event.inputTokens,
          event.outputTokens,
          event.cacheReadTokens,
          event.cacheWriteTokens,
          event.totalTokens,
          event.cost,
          importedAt
        );
      }

      upsertSource.run(file.filePath, file.size, file.mtimeMs, importedAt);
    });

    commit();
  }
}

export function getPersistedUsageEvents(): UsageEvent[] {
  const database = getDb();
  const rows = database
    .prepare(`
      SELECT
        timestamp,
        agent_id AS agentId,
        model,
        input_tokens AS inputTokens,
        output_tokens AS outputTokens,
        cache_read_tokens AS cacheReadTokens,
        cache_write_tokens AS cacheWriteTokens,
        total_tokens AS totalTokens,
        cost
      FROM usage_events
      ORDER BY timestamp ASC
    `)
    .all() as UsageEvent[];

  return rows;
}
