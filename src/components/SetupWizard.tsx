"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, Rocket } from "lucide-react";

interface SetupStatus {
  ready: boolean;
  checklist: {
    env: Array<{ key: string; configured: boolean; required: boolean }>;
    files: { openclawDir: string; hasConfig: boolean; agents: number };
    connectivity: { gatewayUrl: string; gatewayAuth: boolean; gatewayOk: boolean; gatewayService: string };
  };
}

export function SetupWizard() {
  const [data, setData] = useState<SetupStatus | null>(null);

  useEffect(() => {
    fetch("/api/setup/status").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;

  const steps = [
    {
      label: "Required env vars",
      done: data.checklist.env.filter((e) => e.required && e.configured).length === data.checklist.env.filter((e) => e.required).length,
      detail: data.checklist.env.filter((e) => e.required && !e.configured).map((e) => e.key).join(", ") || "All required variables set",
    },
    {
      label: "OpenClaw config detected",
      done: data.checklist.files.hasConfig,
      detail: data.checklist.files.hasConfig
        ? `${data.checklist.files.agents} agents discovered in openclaw.json`
        : `Missing ${data.checklist.files.openclawDir}/openclaw.json`,
    },
    {
      label: "Gateway reachable",
      done: data.checklist.connectivity.gatewayOk,
      detail: `${data.checklist.connectivity.gatewayUrl} (${data.checklist.connectivity.gatewayAuth ? "auth token" : "no token"})`,
    },
  ];

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Rocket className="w-5 h-5" style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>OpenClaw Setup Checklist</h3>
        <span className="ml-auto text-xs" style={{ color: data.ready ? "var(--success)" : "var(--warning)" }}>
          {data.ready ? "Ready" : "Needs setup"}
        </span>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-start gap-3 text-sm">
            {step.done ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5" style={{ color: "var(--success)" }} />
            ) : (
              <CircleAlert className="w-4 h-4 mt-0.5" style={{ color: "var(--warning)" }} />
            )}
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{step.label}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Service status: {data.checklist.connectivity.gatewayService || <CircleDashed className="inline w-3 h-3" />}
      </div>
    </div>
  );
}
