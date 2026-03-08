import path from "path";
import {
  OPENCLAW_CONFIG,
  OPENCLAW_DIR,
  OPENCLAW_MEDIA,
  OPENCLAW_WORKSPACE,
} from "@/lib/openclaw-runtime";

export const WORKSPACE_IDENTITY = path.join(OPENCLAW_WORKSPACE, 'IDENTITY.md');
export const WORKSPACE_TOOLS = path.join(OPENCLAW_WORKSPACE, 'TOOLS.md');
export const WORKSPACE_MEMORY = path.join(OPENCLAW_WORKSPACE, 'memory');

export const SYSTEM_SKILLS_PATH = '/usr/lib/node_modules/openclaw/skills';
export const WORKSPACE_SKILLS_PATH = path.join(OPENCLAW_DIR, 'skills');

/** Allowed base paths for media/file serving */
export const ALLOWED_MEDIA_PREFIXES = [
  path.join(OPENCLAW_WORKSPACE, '/'),
  path.join(OPENCLAW_MEDIA, '/'),
];

export { OPENCLAW_DIR, OPENCLAW_WORKSPACE, OPENCLAW_CONFIG, OPENCLAW_MEDIA };
