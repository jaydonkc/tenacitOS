import { execSync } from "child_process";
import path from "path";
import { resolveHostOpenClawPath } from "@/lib/openclaw-runtime";

const OPENCLAW_TSX_LOADER = "/home/jaydonkc/openclaw/node_modules/tsx/dist/loader.mjs";
const SKILLS_REPORT_SCRIPT = path.resolve(process.cwd(), "scripts", "openclaw-skills-report.mjs");

export interface OpenClawSkillRequirements {
  bins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface OpenClawSkillConfigCheck {
  path: string;
  satisfied: boolean;
}

export interface OpenClawSkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

export interface OpenClawSkillStatusEntry {
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
  requirements: OpenClawSkillRequirements;
  missing: OpenClawSkillRequirements;
  configChecks: OpenClawSkillConfigCheck[];
  install: OpenClawSkillInstallOption[];
}

export interface OpenClawSkillsSummary {
  total: number;
  ready: number;
  blocked: number;
  disabled: number;
  selected: number;
  excluded: number;
}

export interface OpenClawSkillsReport {
  agentId: string;
  defaultAgentId: string;
  workspaceDir: string;
  managedSkillsDir: string;
  allowlist: string[] | null;
  summary: OpenClawSkillsSummary;
  skills: OpenClawSkillStatusEntry[];
}

interface RawOpenClawSkillStatusEntry {
  name: string;
  description: string;
  source: string;
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
  requirements: OpenClawSkillRequirements;
  missing: OpenClawSkillRequirements;
  configChecks: OpenClawSkillConfigCheck[];
  install: OpenClawSkillInstallOption[];
}

interface RawOpenClawSkillsReport {
  agentId: string;
  defaultAgentId: string;
  workspaceDir: string;
  managedSkillsDir: string;
  allowlist: string[] | null;
  summary: OpenClawSkillsSummary;
  skills: RawOpenClawSkillStatusEntry[];
}

function normalizeSourceGroup(source: string): "workspace" | "system" {
  return source.includes("bundled") ? "system" : "workspace";
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function readOpenClawSkillsReport(agentId?: string): OpenClawSkillsReport {
  const args = ["--import", OPENCLAW_TSX_LOADER, SKILLS_REPORT_SCRIPT];
  if (agentId) {
    args.push(agentId);
  }
  const command = [process.execPath, ...args].map(shellEscape).join(" ");

  const output = execSync(command, {
    encoding: "utf-8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const raw = JSON.parse(output) as RawOpenClawSkillsReport;

  return {
    ...raw,
    workspaceDir: resolveHostOpenClawPath(raw.workspaceDir),
    managedSkillsDir: resolveHostOpenClawPath(raw.managedSkillsDir),
    skills: raw.skills.map((skill) => ({
      ...skill,
      id: skill.skillKey || skill.name,
      sourceGroup: normalizeSourceGroup(skill.source),
      filePath: resolveHostOpenClawPath(skill.filePath),
      baseDir: resolveHostOpenClawPath(skill.baseDir),
    })),
  };
}

export function formatSkillMissing(skill: Pick<OpenClawSkillStatusEntry, "missing">): string[] {
  return [
    ...skill.missing.bins.map((bin) => `bin:${bin}`),
    ...skill.missing.env.map((env) => `env:${env}`),
    ...skill.missing.config.map((config) => `config:${config}`),
    ...skill.missing.os.map((os) => `os:${os}`),
  ];
}

export function formatSkillReasons(
  skill: Pick<OpenClawSkillStatusEntry, "disabled" | "blockedByAllowlist">
): string[] {
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push("disabled");
  }
  if (skill.blockedByAllowlist) {
    reasons.push("blocked by allowlist");
  }
  return reasons;
}
