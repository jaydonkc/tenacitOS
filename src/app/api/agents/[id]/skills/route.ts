import { NextResponse } from "next/server";
import { readOpenClawSkillsReport } from "@/lib/openclaw-skills-status";
import { getAgentWorkspace, readOpenClawConfig } from "@/lib/openclaw-runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = readOpenClawConfig();
    const agent = (config.agents?.list || []).find((candidate) => candidate.id === id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const report = readOpenClawSkillsReport(id);
    const allowlist = report.allowlist;
    const allowSet = new Set(allowlist || []);

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name || agent.id,
        workspace: getAgentWorkspace(agent, config),
        skillsFilter: allowlist
          ? {
              mode: "allowlist",
              selectedCount: allowlist.length,
              selectedSkills: allowlist,
            }
          : {
              mode: "all",
              selectedCount: report.skills.length,
              selectedSkills: [],
            },
      },
      report: {
        ...report,
        skills: report.skills.map((skill) => ({
          ...skill,
          enabledForAgent: allowlist ? allowSet.has(skill.name) : true,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to load agent skills status:", error);
    return NextResponse.json({ error: "Failed to load agent skills" }, { status: 500 });
  }
}
