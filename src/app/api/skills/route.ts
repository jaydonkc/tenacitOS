import { NextResponse } from "next/server";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";

interface OpenClawSkill {
  name: string;
  description?: string;
  emoji?: string;
  homepage?: string;
  source?: string;
  eligible?: boolean;
  disabled?: boolean;
  bundled?: boolean;
}

function normalizeSkillSource(source?: string): "workspace" | "system" {
  if (!source) {
    return "system";
  }

  return source.includes("bundled") ? "system" : "workspace";
}

export async function GET() {
  try {
    const data = tryRunOpenClawJson<{ skills?: OpenClawSkill[] }>(["skills", "list", "--json"], 15000);
    const skills = (data?.skills || []).map((skill) => ({
      id: skill.name,
      name: skill.name,
      description: skill.description || "No description provided.",
      location: skill.source || "openclaw",
      source: normalizeSkillSource(skill.source),
      homepage: skill.homepage,
      emoji: skill.emoji,
      fileCount: 0,
      fullContent: skill.description || "",
      files: [] as string[],
      agents: [] as string[],
      eligible: skill.eligible ?? false,
      disabled: skill.disabled ?? false,
      bundled: skill.bundled ?? false,
    }));

    skills.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ skills, source: "openclaw-cli" });
  } catch (error) {
    console.error("Failed to load skills:", error);
    return NextResponse.json({ skills: [] }, { status: 500 });
  }
}
