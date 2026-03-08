/**
 * Office 3D layout for the current OpenClaw stack.
 * Live labels, status, and model data are loaded from `/api/office`.
 */

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  position: [number, number, number]; // x, y, z
  color: string;
  role: string;
}

export const AGENTS: AgentConfig[] = [
  {
    id: "main",
    name: process.env.NEXT_PUBLIC_AGENT_NAME || "Main",
    emoji: process.env.NEXT_PUBLIC_AGENT_EMOJI || "🦞",
    position: [0, 0, 0],
    color: "#ff6b35",
    role: "Coordinator",
  },
  {
    id: "coding",
    name: "Coding",
    emoji: "🧩",
    position: [-4, 0, -3],
    color: "#60a5fa",
    role: "Builder",
  },
  {
    id: "planner",
    name: "Planner",
    emoji: "🗺️",
    position: [4, 0, -3],
    color: "#f59e0b",
    role: "Planning",
  },
  {
    id: "implementer",
    name: "Implementer",
    emoji: "🛠️",
    position: [-4, 0, 3],
    color: "#4ade80",
    role: "Execution",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    emoji: "🔍",
    position: [4, 0, 3],
    color: "#a78bfa",
    role: "Review",
  },
];

export type AgentStatus = "idle" | "working" | "thinking" | "error";

export interface AgentState {
  id: string;
  status: AgentStatus;
  currentTask?: string;
  model?: string; // opus, sonnet, haiku
  tokensPerHour?: number;
  tasksInQueue?: number;
  uptime?: number; // days
}

export function getIdleAgentState(id: string): AgentState {
  return {
    id,
    status: "idle",
  };
}
