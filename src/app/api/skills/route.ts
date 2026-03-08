import { NextResponse } from 'next/server';
import { scanAllSkills } from '@/lib/skill-parser';
import { gatewayGet, gatewayRpc } from '@/lib/openclaw-gateway';

export async function GET() {
  try {
    const rpc = await gatewayRpc<{ skills?: unknown[] }>('skills.list', {});
    if (rpc?.skills && Array.isArray(rpc.skills)) {
      return NextResponse.json({ skills: rpc.skills, source: 'gateway-rpc' });
    }

    const rest = await gatewayGet<{ skills?: unknown[] }>(['/api/skills', '/skills']);
    if (rest?.skills && Array.isArray(rest.skills)) {
      return NextResponse.json({ skills: rest.skills, source: 'gateway-rest' });
    }

    const skills = scanAllSkills();
    return NextResponse.json({ skills, source: 'filesystem-fallback' });
  } catch (error) {
    console.error('Failed to scan skills:', error);
    return NextResponse.json({ skills: [] }, { status: 500 });
  }
}
