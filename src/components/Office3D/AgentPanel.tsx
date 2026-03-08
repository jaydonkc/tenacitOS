'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, Loader2, MessageSquare, Send, X } from 'lucide-react';
import type { AgentConfig, AgentState } from './agentsConfig';

interface AgentSessionSummary {
  id: string;
  sessionId?: string | null;
  key: string;
  updatedAt?: number | null;
  model?: string | null;
}

interface AgentStatusResponse {
  sessions?: AgentSessionSummary[];
  error?: string;
}

interface SessionMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'model_change' | 'system';
  role?: string;
  content: string;
  timestamp: string;
  model?: string;
  toolName?: string;
}

interface SessionMessagesResponse {
  messages?: SessionMessage[];
  error?: string;
}

interface AgentMessagePayload {
  text?: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
}

interface AgentMessageResponse {
  payloads?: AgentMessagePayload[];
  meta?: {
    durationMs?: number;
    agentMeta?: {
      sessionId?: string;
      model?: string;
      provider?: string;
    };
  };
  error?: string;
}

interface ComposeResult {
  replyText: string;
  payloadCount: number;
  sessionId: string | null;
  model: string | null;
  durationMs: number | null;
}

type PanelView = 'summary' | 'compose' | 'history';

function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return 'Unknown time';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString();
}

function resolveSessionId(session: AgentSessionSummary): string | null {
  if (typeof session.sessionId === 'string' && session.sessionId.trim()) {
    return session.sessionId.trim();
  }

  return session.id.includes(':') ? null : session.id;
}

function extractReplyText(payloads: AgentMessagePayload[] | undefined): string {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return '';
  }

  return payloads
    .flatMap((payload) => {
      const parts: string[] = [];
      const text = payload.text?.trim();
      if (text) {
        parts.push(text);
      }

      const media = [
        ...(typeof payload.mediaUrl === 'string' && payload.mediaUrl.trim() ? [payload.mediaUrl.trim()] : []),
        ...(Array.isArray(payload.mediaUrls) ? payload.mediaUrls.map((url) => url.trim()).filter(Boolean) : []),
      ];
      for (const url of media) {
        parts.push(`MEDIA: ${url}`);
      }

      return parts;
    })
    .join('\n\n')
    .trim();
}

function TranscriptBubble({ message }: { message: SessionMessage }) {
  const isUser = message.type === 'user';
  const isTool = message.type === 'tool_use' || message.type === 'tool_result';
  const accentClasses = isUser
    ? 'border-red-500/20 bg-red-500/10 text-white'
    : isTool
      ? 'border-blue-400/20 bg-blue-500/10 text-blue-100'
      : 'border-white/10 bg-white/5 text-white';

  return (
    <div className={`rounded-xl border px-3 py-3 ${accentClasses}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {isUser ? 'User' : isTool ? (message.toolName || 'Tool') : 'Assistant'}
        </span>
        <span className="text-[11px] text-gray-500">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">
        {message.content}
      </p>
    </div>
  );
}

interface AgentPanelProps {
  agent: AgentConfig;
  state?: AgentState;
  onClose: () => void;
}

export default function AgentPanel({ agent, state, onClose }: AgentPanelProps) {
  const status = state?.status ?? 'idle';
  const currentTask = state?.currentTask;
  const model = state?.model;
  const tokensPerHour = state?.tokensPerHour ?? 0;
  const tasksInQueue = state?.tasksInQueue ?? 0;
  const uptime = state?.uptime ?? 0;
  const [panelView, setPanelView] = useState<PanelView>('summary');
  const [draftMessage, setDraftMessage] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<ComposeResult | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySession, setHistorySession] = useState<AgentSessionSummary | null>(null);
  const [historyMessages, setHistoryMessages] = useState<SessionMessage[]>([]);

  useEffect(() => {
    setPanelView('summary');
    setDraftMessage('');
    setSendError(null);
    setSendResult(null);
    setSendingMessage(false);
    setHistoryLoading(false);
    setHistoryError(null);
    setHistorySession(null);
    setHistoryMessages([]);
  }, [agent.id]);

  const getStatusColor = () => {
    switch (status) {
      case 'working': return 'text-green-500';
      case 'thinking': return 'text-blue-500 animate-pulse';
      case 'error': return 'text-red-500';
      case 'idle':
      default: return 'text-gray-500';
    }
  };

  const getStatusBgColor = () => {
    switch (status) {
      case 'working': return 'bg-green-500/20';
      case 'thinking': return 'bg-blue-500/20';
      case 'error': return 'bg-red-500/20';
      case 'idle':
      default: return 'bg-gray-500/20';
    }
  };

  const loadLatestHistory = async () => {
    setPanelView('history');
    setHistoryLoading(true);
    setHistoryError(null);
    setHistorySession(null);
    setHistoryMessages([]);

    try {
      const statusRes = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/status`, {
        cache: 'no-store',
      });
      const statusData = await statusRes.json() as AgentStatusResponse;

      if (!statusRes.ok) {
        throw new Error(statusData.error || 'Failed to load agent sessions');
      }

      const latestSession = [...(statusData.sessions || [])]
        .filter((session) => resolveSessionId(session))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

      const sessionId = latestSession ? resolveSessionId(latestSession) : null;
      if (!latestSession || !sessionId) {
        setHistoryError('No saved session history yet.');
        return;
      }

      setHistorySession(latestSession);

      const transcriptRes = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
      });
      const transcriptData = await transcriptRes.json() as SessionMessagesResponse;

      if (!transcriptRes.ok) {
        throw new Error(transcriptData.error || 'Failed to load session transcript');
      }

      setHistoryMessages(Array.isArray(transcriptData.messages) ? transcriptData.messages : []);
    } catch (error) {
      setHistorySession(null);
      setHistoryMessages([]);
      setHistoryError(error instanceof Error ? error.message : 'Failed to load session history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draftMessage.trim();

    if (!message) {
      setSendError('Enter a message before sending.');
      return;
    }

    setSendingMessage(true);
    setSendError(null);
    setSendResult(null);

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json() as AgentMessageResponse;

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      setSendResult({
        replyText: extractReplyText(data.payloads),
        payloadCount: Array.isArray(data.payloads) ? data.payloads.length : 0,
        sessionId: data.meta?.agentMeta?.sessionId || null,
        model: data.meta?.agentMeta?.model || null,
        durationMs: data.meta?.durationMs ?? null,
      });
      setDraftMessage('');
      setHistoryError(null);
      setHistorySession(null);
      setHistoryMessages([]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const actionBusy = sendingMessage || historyLoading;

  return (
    <div className="absolute right-0 top-0 h-full w-96 overflow-y-auto border-l border-white/10 bg-black/90 p-6 text-white shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-4xl">{agent.emoji}</span>
            {agent.name}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{agent.role}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Status badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 ${getStatusBgColor()}`}>
        <div className={`w-2 h-2 rounded-full ${status === 'thinking' ? 'animate-pulse' : ''}`} style={{ backgroundColor: agent.color }}></div>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {status.toUpperCase()}
        </span>
      </div>

      {/* Current task */}
      {currentTask && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Current Task</h3>
          <p className="text-base">{currentTask}</p>
        </div>
      )}

      {/* Stats */}
      <div className="space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-400">Stats</h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Model */}
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Model</p>
            <p className="text-lg font-bold capitalize">{model || 'N/A'}</p>
          </div>

          {/* Tokens/hour */}
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Tokens/hour</p>
            <p className="text-lg font-bold">{tokensPerHour.toLocaleString()}</p>
          </div>

          {/* Tasks in queue */}
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Queue</p>
            <p className="text-lg font-bold">{tasksInQueue} tasks</p>
          </div>

          {/* Uptime */}
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Uptime</p>
            <p className="text-lg font-bold">{uptime} days</p>
          </div>
        </div>
      </div>

      {/* Activity Feed (placeholder) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Recent Activity</h3>
        <div className="space-y-2">
          <div className="bg-white/5 p-3 rounded-lg text-sm">
            <p className="text-gray-400 text-xs mb-1">2 minutes ago</p>
            <p>Completed task: Generate report</p>
          </div>
          <div className="bg-white/5 p-3 rounded-lg text-sm">
            <p className="text-gray-400 text-xs mb-1">15 minutes ago</p>
            <p>Started: {currentTask || 'Processing data'}</p>
          </div>
          <div className="bg-white/5 p-3 rounded-lg text-sm">
            <p className="text-gray-400 text-xs mb-1">1 hour ago</p>
            <p>Switched model to {model || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setPanelView('compose');
              setSendError(null);
            }}
            disabled={actionBusy}
            className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageSquare size={14} />
            Send Message
          </button>
          <button
            onClick={() => {
              void loadLatestHistory();
            }}
            disabled={actionBusy}
            className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {historyLoading && panelView === 'history' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Clock3 size={14} />
            )}
            View History
          </button>
          <button
            disabled
            title="Model switching is not wired for OpenClaw yet"
            className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            Change Model
          </button>
          <button
            disabled
            title="Task termination is not wired for OpenClaw yet"
            className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300/60 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            Kill Task
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Model changes and task termination are still disabled for the OpenClaw integration.
        </p>

        {panelView !== 'summary' && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPanelView('summary')}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    {panelView === 'compose' ? 'Send a message' : 'Latest session history'}
                  </h4>
                  <p className="text-xs text-gray-400">
                    {panelView === 'compose'
                      ? `Runs a real ${agent.id} agent turn through OpenClaw`
                      : `Loads the most recent saved transcript for ${agent.id}`}
                  </p>
                </div>
              </div>
              {panelView === 'history' && (
                <button
                  onClick={() => {
                    void loadLatestHistory();
                  }}
                  disabled={historyLoading}
                  className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Refresh
                </button>
              )}
            </div>

            {panelView === 'compose' ? (
              <form onSubmit={handleSendMessage} className="space-y-3">
                <textarea
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder={`Message ${agent.name.toLowerCase()}...`}
                  rows={5}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-white/30"
                />

                {sendError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {sendError}
                  </div>
                )}

                {sendResult && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-emerald-200">
                      <span>Reply received</span>
                      {sendResult.model && <span>Model: {sendResult.model}</span>}
                      {sendResult.durationMs !== null && <span>{(sendResult.durationMs / 1000).toFixed(1)}s</span>}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-white">
                      {sendResult.replyText || (sendResult.payloadCount > 0
                        ? 'The agent returned a non-text payload.'
                        : 'The agent completed without a text reply.')}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-300">
                      <span>
                        Session: {sendResult.sessionId || 'Unavailable'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void loadLatestHistory();
                        }}
                        className="rounded-lg bg-white/10 px-3 py-2 font-medium text-white transition-colors hover:bg-white/20"
                      >
                        Open History
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftMessage('');
                      setSendError(null);
                      setSendResult(null);
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={sendingMessage}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingMessage ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Send
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {historyLoading && (
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-gray-300">
                    <Loader2 size={14} className="animate-spin" />
                    Loading the latest session transcript...
                  </div>
                )}

                {historyError && !historyLoading && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
                    {historyError}
                  </div>
                )}

                {historySession && !historyLoading && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Latest session</p>
                    <p className="mt-1 font-mono text-xs text-gray-300">{historySession.key}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                      <span>Updated: {historySession.updatedAt ? new Date(historySession.updatedAt).toLocaleString() : 'Unknown'}</span>
                      <span>Model: {historySession.model || 'Unknown'}</span>
                      <span>Session: {resolveSessionId(historySession) || 'Unavailable'}</span>
                    </div>
                  </div>
                )}

                {historyMessages.length > 0 && !historyLoading && (
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {historyMessages.map((message) => (
                      <TranscriptBubble key={message.id} message={message} />
                    ))}
                  </div>
                )}

                {!historyLoading && !historyError && historySession && historyMessages.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-300">
                    No transcript messages were found for this session yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
