export type DashboardServiceBackend =
  | "systemd"
  | "systemd-user"
  | "pm2"
  | "docker"
  | "none";

export interface DashboardServiceDefinition {
  name: string;
  label: string;
  description: string;
  backend: DashboardServiceBackend;
}

export const MANAGED_SERVICES: DashboardServiceDefinition[] = [
  {
    name: "mission-control",
    label: "Mission Control",
    description: "Mission Control - TenacitOS Dashboard",
    backend: "systemd-user",
  },
  {
    name: "classvault",
    label: "ClassVault",
    description: "ClassVault - LMS Platform",
    backend: "pm2",
  },
  {
    name: "content-vault",
    label: "Content Vault",
    description: "Content Vault - Draft Management Webapp",
    backend: "pm2",
  },
  {
    name: "postiz-simple",
    label: "Postiz",
    description: "Postiz - Social Media Scheduler",
    backend: "pm2",
  },
  {
    name: "brain",
    label: "Brain",
    description: "Brain - Internal Tools",
    backend: "pm2",
  },
  {
    name: "creatoros",
    label: "CreatorOS",
    description: "CreatorOS Platform",
    backend: "none",
  },
];

export const LOG_STREAM_SERVICES: DashboardServiceDefinition[] = [
  ...MANAGED_SERVICES.filter((service) => service.backend !== "none"),
  {
    name: "openclaw-gateway",
    label: "Gateway",
    description: "OpenClaw Gateway",
    backend: "docker",
  },
];

export const PM2_SERVICE_NAMES = MANAGED_SERVICES.filter(
  (service) => service.backend === "pm2"
).map((service) => service.name);

export const USER_SYSTEMD_SERVICE_NAMES = MANAGED_SERVICES.filter(
  (service) => service.backend === "systemd-user"
).map((service) => service.name);

export const SYSTEMD_SERVICE_NAMES = MANAGED_SERVICES.filter(
  (service) => service.backend === "systemd"
).map((service) => service.name);
