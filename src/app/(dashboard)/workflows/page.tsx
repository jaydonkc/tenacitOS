"use client";

import { BRANDING } from "@/config/branding";

interface Workflow {
  id: string;
  emoji: string;
  name: string;
  description: string;
  schedule: string;
  steps: string[];
  status: "active" | "inactive";
  trigger: "cron" | "demand";
}

const WORKFLOWS: Workflow[] = [
  {
    id: "social-radar",
    emoji: "🔭",
    name: "Social Radar",
    description: "Monitor mentions, collaboration opportunities, and relevant conversations across social platforms and forums.",
    schedule: "9:30 AM and 5:30 PM (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      `Search for mentions of ${BRANDING.twitterHandle} on Twitter/X, LinkedIn, and Instagram`,
      "Review Reddit threads in r/webdev, r/javascript, and r/learnprogramming",
      `Flag collaboration opportunities and incoming collabs (${BRANDING.ownerCollabEmail})`,
      "Track aprendiendo.dev mentions and conversations",
      "Send a Telegram summary if anything relevant appears",
    ],
  },
  {
    id: "ai-web-news",
    emoji: "📰",
    name: "AI and Web News",
    description: "Summarize the most relevant AI and web development stories from the Twitter timeline to start the day informed.",
    schedule: "7:45 AM (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Read the Twitter/X timeline via bird CLI",
      "Filter for AI, web dev, architecture, and developer tooling news",
      "Select 5-7 stories most relevant to Carlos's niche",
      "Generate a structured summary with links and context",
      "Send the digest over Telegram",
    ],
  },
  {
    id: "trend-monitor",
    emoji: "🔥",
    name: "Trend Monitor",
    description: "Track urgent trends in the tech niche. Catch viral topics early enough to ride the content wave.",
    schedule: "7 AM, 10 AM, 3 PM, and 8 PM (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Monitor Twitter/X trending topics related to tech and programming",
      "Search Hacker News, dev.to, and GitHub Trending",
      "Evaluate whether the trend is relevant to Carlos's channel",
      "If something urgent appears, notify immediately with context",
      "Suggest a content angle if the trend has potential",
    ],
  },
  {
    id: "daily-linkedin",
    emoji: "📊",
    name: "Daily LinkedIn Brief",
    description: "Generate the day's LinkedIn post from the most relevant Hacker News, dev.to, and broader tech web stories.",
    schedule: "9 AM (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Collect top Hacker News posts from the front page",
      "Review dev.to trends and featured articles",
      "Pick the topic with the strongest engagement potential for Carlos's audience",
      "Draft the LinkedIn post in Carlos's voice (professional and approachable, no emojis or hashtags)",
      "Send the draft over Telegram for review and publishing",
    ],
  },
  {
    id: "newsletter-digest",
    emoji: "📬",
    name: "Newsletter Digest",
    description: "Curated digest of the day's newsletters. Consolidate the best of Carlos's subscriptions into an actionable summary.",
    schedule: "8 PM (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Access Gmail and find newsletters received today",
      "Filter by relevant senders (tech, AI, productivity, investing)",
      "Extract the key points from each newsletter",
      "Generate a category-based digest",
      "Send the summary over Telegram",
    ],
  },
  {
    id: "email-categorization",
    emoji: "📧",
    name: "Email Categorization",
    description: "Categorize and summarize the day's emails so Carlos can start without inbox anxiety.",
    schedule: "7:45 AM (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Access Gmail and read today's unread emails",
      "Categorize them as urgent / collabs / invoices / university / newsletters / other",
      "Summarize each category with a recommended action",
      "Flag client emails with overdue invoices (>90 days)",
      "Send the structured summary over Telegram",
    ],
  },
  {
    id: "weekly-newsletter",
    emoji: "📅",
    name: "Weekly Newsletter",
    description: "Automatic weekly recap of tweets and LinkedIn posts to use as the foundation for the newsletter.",
    schedule: "Sundays at 6 PM",
    trigger: "cron",
    status: "active",
    steps: [
      `Collect the week's tweets (${BRANDING.twitterHandle} via bird CLI)`,
      "Collect published LinkedIn posts",
      "Organize them by topic and relevance",
      "Generate a weekly recap draft in a newsletter tone",
      "Send it over Telegram for review before publishing",
    ],
  },
  {
    id: "advisory-board",
    emoji: "🏛️",
    name: "Advisory Board",
    description: "Seven AI advisors with distinct personalities and memories. Consult any advisor or summon the full board.",
    schedule: "On demand",
    trigger: "demand",
    status: "active",
    steps: [
      "Carlos sends /cfo, /cmo, /cto, /legal, /growth, /coach, or /product",
      "Tenacitas loads the advisory-board/SKILL.md skill",
      "Read the matching advisor memory file (memory/advisors/)",
      "Respond in that advisor's voice using Carlos-specific context",
      "Update the advisor memory file with what was learned",
      "/board summons all seven advisors in sequence and compiles a full board meeting",
    ],
  },
  {
    id: "git-backup",
    emoji: "🔄",
    name: "Git Backup",
    description: "Auto-commit and push the workspace every four hours so nothing gets lost.",
    schedule: "Every 4 hours",
    trigger: "cron",
    status: "active",
    steps: [
      "Check whether there are changes in the Tenacitas workspace",
      "If changes exist: git add -A",
      "Generate an automatic commit message with a timestamp and summary",
      "Push to the remote repository",
      "Stay silent when nothing changed and notify only on error",
    ],
  },
  {
    id: "nightly-evolution",
    emoji: "🌙",
    name: "Nightly Evolution",
    description: "Autonomous nightly session that ships Mission Control improvements from the ROADMAP or invents useful new features.",
    schedule: "3 AM (nightly)",
    trigger: "cron",
    status: "active",
    steps: [
      "Read Mission Control's ROADMAP.md to pick the next feature",
      "If nothing is obvious, analyze the current state and invent something useful",
      "Implement the full feature (code, tests when relevant, UI)",
      "Verify that the Next.js build still passes",
      "Notify Carlos on Telegram with a summary of what shipped",
    ],
  },
];

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: status === "active" ? "var(--positive)" : "var(--text-muted)",
      }} />
      <span style={{
        fontFamily: "var(--font-body)",
        fontSize: "10px",
        fontWeight: 600,
        color: status === "active" ? "var(--positive)" : "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>
        {status === "active" ? "Active" : "Inactive"}
      </span>
    </div>
  );
}

function TriggerBadge({ trigger }: { trigger: "cron" | "demand" }) {
  return (
    <div style={{
      padding: "2px 7px",
      backgroundColor: trigger === "cron"
        ? "rgba(59, 130, 246, 0.12)"
        : "rgba(168, 85, 247, 0.12)",
      border: `1px solid ${trigger === "cron" ? "rgba(59, 130, 246, 0.25)" : "rgba(168, 85, 247, 0.25)"}`,
      borderRadius: "5px",
      fontFamily: "var(--font-body)",
      fontSize: "10px",
      fontWeight: 600,
      color: trigger === "cron" ? "#60a5fa" : "var(--accent)",
      letterSpacing: "0.4px",
      textTransform: "uppercase" as const,
    }}>
      {trigger === "cron" ? "⏱ Cron" : "⚡ On Demand"}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "24px",
          fontWeight: 700,
          letterSpacing: "-1px",
          color: "var(--text-primary)",
          marginBottom: "4px",
        }}>
          Workflows
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
          {WORKFLOWS.filter(w => w.status === "active").length} active workflows · {WORKFLOWS.filter(w => w.trigger === "cron").length} automated cron jobs · {WORKFLOWS.filter(w => w.trigger === "demand").length} on demand
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "32px", flexWrap: "wrap" }}>
        {[
          { label: "Total workflows", value: WORKFLOWS.length, color: "var(--text-primary)" },
          { label: "Active cron jobs", value: WORKFLOWS.filter(w => w.trigger === "cron" && w.status === "active").length, color: "#60a5fa" },
          { label: "On demand", value: WORKFLOWS.filter(w => w.trigger === "demand").length, color: "var(--accent)" },
        ].map((stat) => (
          <div key={stat.label} style={{
            padding: "16px 20px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            minWidth: "140px",
          }}>
            <div style={{
              fontFamily: "var(--font-heading)",
              fontSize: "28px",
              fontWeight: 700,
              color: stat.color,
              letterSpacing: "-1px",
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Workflow cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {WORKFLOWS.map((workflow) => (
          <div key={workflow.id} style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "20px 24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}>
            {/* Card header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  backgroundColor: "var(--surface-elevated)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  border: "1px solid var(--border-strong)",
                  flexShrink: 0,
                }}>
                  {workflow.emoji}
                </div>
                <div>
                  <h3 style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.3px",
                    marginBottom: "2px",
                  }}>
                    {workflow.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TriggerBadge trigger={workflow.trigger} />
                    <StatusBadge status={workflow.status} />
                  </div>
                </div>
              </div>
              {/* Schedule */}
              <div style={{
                padding: "6px 12px",
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontFamily: "var(--font-body)",
                fontSize: "11px",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap" as const,
                flexShrink: 0,
              }}>
                🕐 {workflow.schedule}
              </div>
            </div>

            {/* Description */}
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: "13px",
              color: "var(--text-secondary)",
              lineHeight: "1.6",
              marginBottom: "16px",
            }}>
              {workflow.description}
            </p>

            {/* Steps */}
            <div style={{
              backgroundColor: "var(--surface-elevated)",
              borderRadius: "10px",
              padding: "12px 16px",
              border: "1px solid var(--border)",
            }}>
              <div style={{
                fontFamily: "var(--font-body)",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.7px",
                marginBottom: "8px",
              }}>
                Pasos
              </div>
              <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {workflow.steps.map((step, i) => (
                  <li key={i} style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.5",
                  }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
