"use client";

import { useState } from "react";
import {
  RefreshCw,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Activity,
  MessageSquare,
} from "lucide-react";

interface QuickActionsProps {
  onActionComplete?: () => void;
}

interface ActionButton {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "emerald" | "blue" | "yellow" | "purple";
  action: () => Promise<void> | void;
}

export function QuickActions({ onActionComplete }: QuickActionsProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const runAction = async (action: string) => {
    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      throw new Error(`Failed action: ${action}`);
    }

    return res.json() as Promise<{ output?: string; status?: string }>;
  };

  const handleRestartGateway = async () => {
    setLoadingAction("restart");
    try {
      const result = await runAction("restart-gateway");
      showNotification(
        "success",
        result?.status === "success" ? "Gateway restarted" : "Gateway restart requested"
      );
      onActionComplete?.();
    } catch {
      showNotification("error", "Failed to restart gateway");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleViewLogs = async () => {
    setLoadingAction("view_logs");
    try {
      await runAction("gateway-logs");
      showNotification("success", "Gateway logs fetched in backend action log");
      onActionComplete?.();
    } catch {
      showNotification("error", "Failed to fetch gateway logs");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGatewayStatus = async () => {
    setLoadingAction("gateway_status");
    try {
      await runAction("gateway-status");
      showNotification("success", "Gateway status refreshed");
      onActionComplete?.();
    } catch {
      showNotification("error", "Failed to check gateway status");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSessionPing = async () => {
    setLoadingAction("session_ping");
    try {
      await runAction("session-ping");
      showNotification("success", "Main session probe completed");
    } catch {
      showNotification("error", "Failed to probe main session");
    } finally {
      setLoadingAction(null);
    }
  };

  const actions: ActionButton[] = [
    {
      id: "restart",
      label: "Restart Gateway",
      icon: RefreshCw,
      color: "blue",
      action: handleRestartGateway,
    },
    {
      id: "gateway_status",
      label: "Gateway Status",
      icon: Activity,
      color: "purple",
      action: handleGatewayStatus,
    },
    {
      id: "view_logs",
      label: "Gateway Logs",
      icon: FileText,
      color: "emerald",
      action: handleViewLogs,
    },
    {
      id: "session_ping",
      label: "Probe Main Session",
      icon: MessageSquare,
      color: "yellow",
      action: handleSessionPing,
    },
  ];

  const colorClasses = {
    emerald:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20",
    yellow:
      "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20",
    purple:
      "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20",
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <RefreshCw className="w-5 h-5 text-emerald-400" />
        Quick Actions
      </h2>

      {/* Notification */}
      {notification && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
            notification.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border border-red-500/30"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm">{notification.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isLoading = loadingAction === action.id;

          return (
            <button
              key={action.id}
              onClick={() => action.action()}
              disabled={isLoading}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                colorClasses[action.color]
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              <span className="font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
