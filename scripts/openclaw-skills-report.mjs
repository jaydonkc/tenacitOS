import { loadConfig } from "/home/jaydonkc/openclaw/src/config/config";
import {
  listAgentIds,
  resolveAgentSkillsFilter,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "/home/jaydonkc/openclaw/src/agents/agent-scope";
import { buildWorkspaceSkillStatus } from "/home/jaydonkc/openclaw/src/agents/skills-status";
import { getRemoteSkillEligibility } from "/home/jaydonkc/openclaw/src/infra/skills-remote";

const requestedAgentId = process.argv[2]?.trim() || undefined;
const config = loadConfig();
const defaultAgentId = resolveDefaultAgentId(config);
const agentId = requestedAgentId || defaultAgentId;

if (requestedAgentId) {
  const knownAgents = new Set(listAgentIds(config));
  if (!knownAgents.has(agentId)) {
    throw new Error(`Unknown agent id "${requestedAgentId}"`);
  }
}

const workspaceDir = resolveAgentWorkspaceDir(config, agentId);
const report = buildWorkspaceSkillStatus(workspaceDir, {
  config,
  eligibility: { remote: getRemoteSkillEligibility() },
});
const allowlist = resolveAgentSkillsFilter(config, agentId) ?? null;
const allowSet = new Set(allowlist || []);
const selectedCount = allowlist ? report.skills.filter((skill) => allowSet.has(skill.name)).length : report.skills.length;
const excludedCount = allowlist ? report.skills.length - selectedCount : 0;
const readyCount = report.skills.filter((skill) => skill.eligible).length;
const blockedCount = report.skills.filter((skill) => !skill.eligible).length;
const disabledCount = report.skills.filter((skill) => skill.disabled).length;

console.log(
  JSON.stringify({
    agentId,
    defaultAgentId,
    workspaceDir: report.workspaceDir,
    managedSkillsDir: report.managedSkillsDir,
    allowlist,
    summary: {
      total: report.skills.length,
      ready: readyCount,
      blocked: blockedCount,
      disabled: disabledCount,
      selected: selectedCount,
      excluded: excludedCount,
    },
    skills: report.skills,
  })
);
