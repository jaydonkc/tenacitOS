"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Eye, Edit3, RefreshCw, Brain, GitBranch, Loader2, Search, Server } from "lucide-react";
import { FileTree, FileNode } from "@/components/FileTree";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import type { MemoryGraphEdge, MemoryGraphNode } from "@/lib/memory-stack";

type ViewMode = "edit" | "preview";

interface Workspace {
  id: string;
  name: string;
  emoji: string;
  path: string;
  agentName?: string;
}

interface MemoryServiceHealth {
  reachable: boolean;
  statusCode: number | null;
  composeStatus: string | null;
  graphEnabled: boolean | null;
  addInferDefault: boolean | null;
  searchRerankDefault: boolean | null;
  error?: string | null;
}

interface MemoryWorkspaceBackend {
  workspaceId: string;
  workspaceName: string;
  workspaceEmoji: string;
  workspacePath: string;
  agentIds: string[];
  agentName?: string;
  serviceName: string | null;
  backendLabel: string;
  graphEnabled: boolean;
  neo4jEnabled: boolean;
  health: MemoryServiceHealth | null;
}

interface MemoryStackResponse {
  pluginEnabled: boolean;
  pluginSlot: string | null;
  userId: string | null;
  autoRecall: boolean;
  autoCapture: boolean;
  neo4jStatus: string | null;
  workspaces: MemoryWorkspaceBackend[];
}

interface MemorySearchResultSnippet {
  id: string;
  text: string;
  score: number | null;
}

interface MemoryGraphResponse {
  workspaceId: string;
  workspaceName: string;
  query: string;
  backendLabel: string;
  serviceName: string | null;
  graphEnabled: boolean;
  rawResultsCount: number;
  rawRelationsCount: number;
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  results: MemorySearchResultSnippet[];
  error?: string;
}

function shortLabel(value: string, max = 22): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function GraphCanvas({ nodes, edges }: { nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[] }) {
  const width = 560;
  const height = 220;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = nodes.length <= 1 ? 0 : Math.max(56, 86 - nodes.length * 3);

  const positions = new Map(
    nodes.map((node, index) => {
      if (nodes.length === 1) {
        return [node.id, { x: centerX, y: centerY }];
      }

      const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [
        node.id,
        {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        },
      ];
    })
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: "100%",
        height: "220px",
        borderRadius: "12px",
        background: "radial-gradient(circle at top, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
        border: "1px solid var(--border)",
      }}
    >
      {edges.map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) {
          return null;
        }

        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;

        return (
          <g key={edge.id}>
            <line
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1.5"
            />
            <rect
              x={midX - 34}
              y={midY - 10}
              width={68}
              height={20}
              rx={10}
              fill="rgba(15,23,42,0.92)"
            />
            <text
              x={midX}
              y={midY + 4}
              textAnchor="middle"
              style={{ fill: "var(--text-muted)", fontSize: "10px", fontFamily: "var(--font-body)" }}
            >
              {shortLabel(edge.label, 14)}
            </text>
          </g>
        );
      })}

      {nodes.map((node) => {
        const point = positions.get(node.id);
        if (!point) {
          return null;
        }

        return (
          <g key={node.id}>
            <circle cx={point.x} cy={point.y} r={24} fill="rgba(255,59,48,0.16)" stroke="var(--accent)" strokeWidth="1.5" />
            <text
              x={point.x}
              y={point.y + 3}
              textAnchor="middle"
              style={{ fill: "var(--text-primary)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-body)" }}
            >
              {shortLabel(node.label, 10)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MemoryPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryStack, setMemoryStack] = useState<MemoryStackResponse | null>(null);
  const [stackLoading, setStackLoading] = useState(true);
  const [stackError, setStackError] = useState<string | null>(null);
  const [graphQuery, setGraphQuery] = useState("");
  const [graphData, setGraphData] = useState<MemoryGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const hasUnsavedChanges = content !== originalContent;

  // Load workspaces
  useEffect(() => {
    fetch("/api/files/workspaces")
      .then((res) => res.json())
      .then((data) => {
        setWorkspaces(data.workspaces || []);
        if (data.workspaces.length > 0) {
          setSelectedWorkspace(data.workspaces[0].id);
        }
      })
      .catch(() => setWorkspaces([]));
  }, []);

  useEffect(() => {
    fetch("/api/memory/stack", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.error) {
          throw new Error(data.error);
        }
        setMemoryStack(data);
        setStackError(null);
      })
      .catch((err) => {
        setMemoryStack(null);
        setStackError(err instanceof Error ? err.message : "Failed to load memory stack");
      })
      .finally(() => setStackLoading(false));
  }, []);

  const loadFileTree = useCallback(async (workspace: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/files?workspace=${encodeURIComponent(workspace)}`);
      if (!res.ok) throw new Error("Failed to load files");
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      setError("Failed to load file tree");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadFile = useCallback(async (workspace: string, path: string) => {
    try {
      setError(null);
      const res = await fetch(
        `/api/files?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`
      );
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setContent(data.content);
      setOriginalContent(data.content);
    } catch (err) {
      setError("Failed to load file");
      console.error(err);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedWorkspace || !selectedPath) return;
    const res = await fetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: selectedWorkspace, path: selectedPath, content }),
    });
    if (!res.ok) throw new Error("Failed to save file");
    setOriginalContent(content);
  }, [selectedWorkspace, selectedPath, content]);

  const handleSelectFile = useCallback(
    async (path: string) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm("You have unsaved changes. Discard them?");
        if (!confirmed) return;
      }
      setSelectedPath(path);
      if (selectedWorkspace) await loadFile(selectedWorkspace, path);
    },
    [hasUnsavedChanges, selectedWorkspace, loadFile]
  );

  const handleWorkspaceSelect = (workspaceId: string) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Discard them?");
      if (!confirmed) return;
    }
    setSelectedWorkspace(workspaceId);
    setSelectedPath(null);
    setContent("");
    setOriginalContent("");
  };

  useEffect(() => {
    if (selectedWorkspace) loadFileTree(selectedWorkspace);
  }, [selectedWorkspace, loadFileTree]);

  useEffect(() => {
    if (files.length > 0 && !selectedPath) {
      const memoryMd = files.find((f) => f.name === "MEMORY.md" && f.type === "file");
      const firstFile = memoryMd || files.find((f) => f.type === "file");
      if (firstFile) handleSelectFile(firstFile.path);
    }
  }, [files, selectedPath, handleSelectFile]);

  const selectedWorkspaceData = workspaces.find((w) => w.id === selectedWorkspace);
  const selectedWorkspaceBackend = useMemo(
    () => memoryStack?.workspaces.find((workspace) => workspace.workspaceId === selectedWorkspace) || null,
    [memoryStack, selectedWorkspace]
  );

  useEffect(() => {
    setGraphData(null);
    setGraphError(null);
    setGraphQuery("");
  }, [selectedWorkspace]);

  const loadGraph = useCallback(async () => {
    if (!selectedWorkspaceBackend?.graphEnabled || !selectedWorkspace) {
      return;
    }

    const query = graphQuery.trim();
    if (!query) {
      setGraphError("Enter a query to inspect GraphRAG relations.");
      return;
    }

    try {
      setGraphLoading(true);
      setGraphError(null);
      const res = await fetch("/api/memory/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          query,
          limit: 12,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load graph");
      }
      setGraphData(data);
    } catch (err) {
      setGraphData(null);
      setGraphError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setGraphLoading(false);
    }
  }, [graphQuery, selectedWorkspace, selectedWorkspaceBackend]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Page header */}
      <div style={{ padding: "24px 24px 16px 24px", flexShrink: 0 }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "24px",
            fontWeight: 700,
            letterSpacing: "-1px",
            color: "var(--text-primary)",
            marginBottom: "4px",
          }}
        >
          Memory Browser
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
          View memory files and verify the live OpenClaw memory backend per workspace
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
          {memoryStack
            ? `Slot ${memoryStack.pluginSlot || "memory"} • user ${memoryStack.userId || "default"} • auto recall ${memoryStack.autoRecall ? "on" : "off"} • auto capture ${memoryStack.autoCapture ? "on" : "off"}`
            : "Loading OpenClaw memory stack..."}
        </p>
      </div>

      <div style={{ padding: "0 24px 16px 24px", flexShrink: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "12px",
          }}
        >
          {(memoryStack?.workspaces || []).map((workspace) => {
            const isSelected = selectedWorkspace === workspace.workspaceId;
            const health = workspace.health;
            return (
              <button
                key={workspace.workspaceId}
                onClick={() => handleWorkspaceSelect(workspace.workspaceId)}
                style={{
                  textAlign: "left",
                  padding: "16px",
                  borderRadius: "14px",
                  border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(255,59,48,0.12), rgba(255,255,255,0.03))"
                    : "var(--card)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "20px", lineHeight: 1 }}>{workspace.workspaceEmoji}</span>
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {workspace.workspaceName}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                      {workspace.backendLabel}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: health?.reachable ? "#4ade80" : "var(--text-muted)",
                      backgroundColor: health?.reachable ? "rgba(74,222,128,0.12)" : "rgba(148,163,184,0.12)",
                    }}
                  >
                    {health?.reachable ? "live" : "config"}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    service {workspace.serviceName || "n/a"}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    agents {workspace.agentIds.join(", ")}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                  <div style={{ padding: "10px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Graph
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {workspace.graphEnabled ? "Neo4j enabled" : "Vector only"}
                    </div>
                  </div>
                  <div style={{ padding: "10px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Search
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                      rerank {health?.searchRerankDefault ? "on" : "off"}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {stackLoading && (
            <div
              style={{
                padding: "16px",
                borderRadius: "14px",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              Checking OpenClaw memory stack...
            </div>
          )}

          {!stackLoading && stackError && (
            <div
              style={{
                padding: "16px",
                borderRadius: "14px",
                border: "1px solid rgba(252,165,165,0.24)",
                background: "rgba(127,29,29,0.18)",
                color: "#fecaca",
                fontSize: "13px",
              }}
            >
              {stackError}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          borderTop: "1px solid var(--border)",
        }}
      >
        {/* ── LEFT SIDEBAR: Workspace list ────────────────────────────────── */}
        <aside
          style={{
            width: "220px",
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            padding: "16px 0",
            backgroundColor: "var(--surface, var(--card))",
          }}
        >
          <p
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              padding: "0 16px 8px",
              textTransform: "uppercase",
            }}
          >
            Workspaces
          </p>

          {workspaces.map((workspace) => {
            const isSelected = selectedWorkspace === workspace.id;
            return (
              <button
                key={workspace.id}
                onClick={() => handleWorkspaceSelect(workspace.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "9px 16px",
                  background: isSelected ? "var(--accent-soft)" : "transparent",
                  border: "none",
                  borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 120ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "var(--surface-hover, rgba(255,255,255,0.05))";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>{workspace.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "13px",
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "var(--accent)" : "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {workspace.name}
                  </div>
                  {workspace.agentName && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {workspace.agentName}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </aside>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selectedWorkspace && selectedWorkspaceData ? (
            <>
              {/* Toolbar bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px",
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: "var(--surface, var(--card))",
                  flexShrink: 0,
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" }}>
                  <Brain style={{ width: "16px", height: "16px", color: "var(--accent)" }} />
                  <span
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {selectedWorkspaceData.name}
                  </span>
                  {selectedPath && (
                    <>
                      <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>/</span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "300px",
                        }}
                      >
                        {selectedPath}
                      </span>
                    </>
                  )}
                  {selectedWorkspaceBackend && (
                    <>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          color: "var(--text-secondary)",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        {selectedWorkspaceBackend.serviceName || "mem0"}
                      </span>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          backgroundColor: selectedWorkspaceBackend.graphEnabled ? "rgba(96,165,250,0.14)" : "rgba(148,163,184,0.12)",
                          color: selectedWorkspaceBackend.graphEnabled ? "#60a5fa" : "var(--text-muted)",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        {selectedWorkspaceBackend.graphEnabled ? "GraphRAG" : "Vector"}
                      </span>
                    </>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  {/* Refresh */}
                  <button
                    onClick={() => selectedWorkspace && loadFileTree(selectedWorkspace)}
                    title="Refresh"
                    style={{
                      padding: "5px 7px",
                      borderRadius: "6px",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 120ms ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <RefreshCw size={14} />
                  </button>

                  {/* View toggle */}
                  <div
                    style={{
                      display: "flex",
                      backgroundColor: "var(--bg)",
                      borderRadius: "6px",
                      padding: "3px",
                      gap: "2px",
                    }}
                  >
                    <button
                      onClick={() => setViewMode("preview")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "5px 10px",
                        borderRadius: "4px",
                        backgroundColor: viewMode === "preview" ? "var(--accent)" : "transparent",
                        color: viewMode === "preview" ? "var(--bg, #111)" : "var(--text-muted)",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                        transition: "all 120ms ease",
                      }}
                    >
                      <Eye size={13} />
                      Preview
                    </button>
                    <button
                      onClick={() => setViewMode("edit")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "5px 10px",
                        borderRadius: "4px",
                        backgroundColor: viewMode === "edit" ? "var(--accent)" : "transparent",
                        color: viewMode === "edit" ? "var(--bg, #111)" : "var(--text-muted)",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                        transition: "all 120ms ease",
                      }}
                    >
                      <Edit3 size={13} />
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              {selectedWorkspaceBackend && (
                <div
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: "var(--surface, var(--card))",
                    display: "grid",
                    gridTemplateColumns: selectedWorkspaceBackend.graphEnabled ? "minmax(0, 1fr) minmax(0, 1.2fr)" : "minmax(0, 1fr)",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "14px",
                      padding: "14px",
                      backgroundColor: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                      <Server style={{ width: "16px", height: "16px", color: "var(--accent)" }} />
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                        Workspace Memory Backend
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                      {selectedWorkspaceBackend.workspaceName} is routed through {selectedWorkspaceBackend.backendLabel}.
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                      <div style={{ padding: "12px", borderRadius: "10px", backgroundColor: "var(--bg)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
                          Service
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {selectedWorkspaceBackend.serviceName || "Not mapped"}
                        </div>
                      </div>
                      <div style={{ padding: "12px", borderRadius: "10px", backgroundColor: "var(--bg)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
                          Health
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: selectedWorkspaceBackend.health?.reachable ? "#4ade80" : "var(--text-primary)" }}>
                          {selectedWorkspaceBackend.health?.reachable ? "Connected" : selectedWorkspaceBackend.health?.composeStatus || "Config only"}
                        </div>
                      </div>
                      <div style={{ padding: "12px", borderRadius: "10px", backgroundColor: "var(--bg)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
                          Extract / Update
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          infer {selectedWorkspaceBackend.health?.addInferDefault ? "on" : "off"}
                        </div>
                      </div>
                      <div style={{ padding: "12px", borderRadius: "10px", backgroundColor: "var(--bg)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
                          Retrieval
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          rerank {selectedWorkspaceBackend.health?.searchRerankDefault ? "on" : "off"}
                        </div>
                      </div>
                    </div>

                    {selectedWorkspaceBackend.graphEnabled ? (
                      <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        Coding uses the graph-enabled mem0 service, which is backed by Neo4j for relationship extraction and GraphRAG-style relation search.
                      </div>
                    ) : (
                      <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        Main uses the simple mem0 service: vector memory only, no Neo4j graph store.
                      </div>
                    )}
                  </div>

                  {selectedWorkspaceBackend.graphEnabled && (
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "14px",
                        padding: "14px",
                        backgroundColor: "rgba(255,255,255,0.02)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <GitBranch style={{ width: "16px", height: "16px", color: "#60a5fa" }} />
                        <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                          GraphRAG Explorer
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        Queries the live graph-enabled mem0 backend and visualizes returned relations.
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          value={graphQuery}
                          onChange={(event) => setGraphQuery(event.target.value)}
                          placeholder="Search coding graph relations"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            borderRadius: "10px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg)",
                            color: "var(--text-primary)",
                            padding: "10px 12px",
                            fontSize: "13px",
                          }}
                        />
                        <button
                          onClick={loadGraph}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "10px 12px",
                            borderRadius: "10px",
                            border: "1px solid rgba(96,165,250,0.35)",
                            backgroundColor: "rgba(96,165,250,0.12)",
                            color: "#bfdbfe",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {graphLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                          Search
                        </button>
                      </div>

                      {graphError && (
                        <div style={{ fontSize: "12px", color: "#fca5a5" }}>{graphError}</div>
                      )}

                      {graphData && graphData.nodes.length > 0 && graphData.edges.length > 0 && (
                        <>
                          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
                            <span>{graphData.rawRelationsCount} relations</span>
                            <span>{graphData.nodes.length} nodes</span>
                            <span>{graphData.rawResultsCount} matched memories</span>
                          </div>
                          <GraphCanvas nodes={graphData.nodes} edges={graphData.edges} />
                          {graphData.results.length > 0 && (
                            <div style={{ display: "grid", gap: "8px" }}>
                              {graphData.results.slice(0, 3).map((result) => (
                                <div
                                  key={result.id}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: "10px",
                                    backgroundColor: "var(--bg)",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  <div style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.5 }}>
                                    {shortLabel(result.text, 160)}
                                  </div>
                                  {typeof result.score === "number" && (
                                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-muted)" }}>
                                      score {result.score.toFixed(3)}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {graphData && graphData.nodes.length === 0 && (
                        <div
                          style={{
                            borderRadius: "12px",
                            border: "1px dashed var(--border)",
                            padding: "18px",
                            color: "var(--text-secondary)",
                            fontSize: "12px",
                          }}
                        >
                          GraphRAG is available for this workspace, but the current mem0 store returned no relations for “{graphData.query}”.
                        </div>
                      )}

                      {!graphData && !graphLoading && (
                        <div
                          style={{
                            borderRadius: "12px",
                            border: "1px dashed var(--border)",
                            padding: "18px",
                            color: "var(--text-secondary)",
                            fontSize: "12px",
                          }}
                        >
                          The coding workspace is confirmed on the graph-enabled mem0 + Neo4j stack. Run a search above to inspect live graph relations when memories exist.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* File tree + editor */}
              <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* File tree */}
                <div
                  style={{
                    width: "230px",
                    flexShrink: 0,
                    borderRight: "1px solid var(--border)",
                    overflowY: "auto",
                  }}
                >
                  {isLoading ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                      Loading...
                    </div>
                  ) : error && files.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--negative)" }}>
                      {error}
                    </div>
                  ) : (
                    <FileTree files={files} selectedPath={selectedPath} onSelect={handleSelectFile} />
                  )}
                </div>

                {/* Editor / Preview */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    backgroundColor: "var(--bg)",
                    overflow: "hidden",
                  }}
                >
                  {selectedPath ? (
                    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                      {viewMode === "edit" ? (
                        <MarkdownEditor
                          content={content}
                          onChange={setContent}
                          onSave={saveFile}
                          hasUnsavedChanges={hasUnsavedChanges}
                        />
                      ) : (
                        <MarkdownPreview content={content} />
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        <Brain style={{ width: "64px", height: "64px", margin: "0 auto 16px", opacity: 0.3 }} />
                        <p style={{ fontSize: "14px" }}>Select a file to view or edit</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: "14px",
              }}
            >
              Select a workspace
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
