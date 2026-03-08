import { getPersistedUsageEvents, syncUsageLedger, type UsageEvent } from "./usage-ledger";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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

interface AgentBreakdown extends DashboardBreakdown {
  agent: string;
}

interface ModelBreakdown extends DashboardBreakdown {
  model: string;
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

function toAgentBreakdownEntries(data: Map<string, AggregateBucket>): AgentBreakdown[] {
  const rows: AgentBreakdown[] = Array.from(data.entries()).map(([agent, bucket]) => ({
    agent,
    cost: roundCurrency(bucket.cost),
    tokens: bucket.totalTokens,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    percentOfTotal: 0,
  }));

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);

  return rows
    .map((row) => ({
      ...row,
      percentOfTotal: totalCost > 0 ? (row.cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);
}

function toModelBreakdownEntries(data: Map<string, AggregateBucket>): ModelBreakdown[] {
  const rows: ModelBreakdown[] = Array.from(data.entries()).map(([model, bucket]) => ({
    model,
    cost: roundCurrency(bucket.cost),
    tokens: bucket.totalTokens,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    percentOfTotal: 0,
  }));

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);

  return rows
    .map((row) => ({
      ...row,
      percentOfTotal: totalCost > 0 ? (row.cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export async function loadCostDashboardData(days: number, budget: number) {
  await syncUsageLedger();

  const events = getPersistedUsageEvents();
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
  let allTime = 0;
  let allTimeTokens = 0;

  const byAgent = new Map<string, AggregateBucket>();
  const byModel = new Map<string, AggregateBucket>();
  const dailyBuckets = new Map<string, AggregateBucket>();
  const hourlyBuckets = new Map<number, number>();

  for (const event of events) {
    allTime += event.cost;
    allTimeTokens += event.totalTokens;

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
    allTime: roundCurrency(allTime),
    allTimeTokens,
    projected: roundCurrency(projected),
    budget,
    byAgent: toAgentBreakdownEntries(byAgent),
    byModel: toModelBreakdownEntries(byModel),
    daily,
    hourly,
    updatedAt: nowMs,
    source: "persistent-usage-ledger",
    message:
      events.length > 0
        ? undefined
        : "No OpenClaw session usage found yet.",
  };
}
