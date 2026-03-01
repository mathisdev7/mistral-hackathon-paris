"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  Loading03Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  NoteIcon,
  Medal01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef } from "react";

import type { UIMessage } from "ai";

export type TopicCard = {
  title: string;
  subtitle: string;
};


type Props = {
  messages: UIMessage[];
  isThinking: boolean;
  isSessionActive?: boolean;
  showStarterCards?: boolean;
  starterTopics?: TopicCard[];
  topicsLoading?: boolean;
  topicsSource?: "ai" | "fallback" | null;
  onPickStarterTopicAction?: (title: string) => void;
};

/** Strip expression tags like [laughs], [excited], [pauses] etc. from displayed text */
function stripExpressionTags(text: string): string {
  return text.replace(/\[[\w\s]+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Friendly label for tool invocations shown as subtle status indicators */
function getToolLabel(part: { type: string; state?: string }): string | null {
  const toolName = part.type.replace(/^tool-/, "");
  const state = (part as { state?: string }).state;

  if (toolName === "start_session") {
    if (state === "output-available") return "Session started";
    return "Starting session...";
  }
  if (toolName === "end_session") {
    if (state === "output-available") return "Session saved";
    return "Saving session...";
  }

  return null;
}

type EndSessionRecap = {
  scenario?: string;
  summary?: string;
  levelAssessment?: string;
  strengths: string[];
  weaknesses: string[];
};

function getEndSessionRecap(part: {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}): EndSessionRecap | null {
  if (part.type !== "tool-end_session") return null;

  const inputSource = (part.input ?? {}) as {
    scenario?: unknown;
    summary?: unknown;
    levelAssessment?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
  };

  const outputSource = (part.output ?? {}) as {
    scenario?: unknown;
    summary?: unknown;
    levelAssessment?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
    result?: unknown;
  };

  const nestedResultSource =
    outputSource && typeof outputSource.result === "object" && outputSource.result !== null
      ? (outputSource.result as {
          scenario?: unknown;
          summary?: unknown;
          levelAssessment?: unknown;
          strengths?: unknown;
          weaknesses?: unknown;
        })
      : {};

  const source = {
    ...inputSource,
    ...outputSource,
    ...nestedResultSource,
  };

  const strengths = Array.isArray(source?.strengths)
    ? source.strengths.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const weaknesses = Array.isArray(source?.weaknesses)
    ? source.weaknesses.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const recap: EndSessionRecap = {
    scenario: typeof source?.scenario === "string" ? source.scenario : undefined,
    summary: typeof source?.summary === "string" ? source.summary : undefined,
    levelAssessment:
      typeof source?.levelAssessment === "string" ? source.levelAssessment : undefined,
    strengths,
    weaknesses,
  };

  if (!recap.scenario && !recap.summary && !recap.levelAssessment && strengths.length === 0 && weaknesses.length === 0) {
    return null;
  }

  return recap;
}

// ─── Recap card ──────────────────────────────────────────────────────────────

type RecapCardProps = {
  recap: EndSessionRecap;
  label?: string;
};

function RecapCard({ recap, label = "Session recap" }: RecapCardProps) {
  return (
    <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <HugeiconsIcon icon={Medal01Icon} size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Meta row */}
        {(recap.scenario ?? recap.levelAssessment) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {recap.scenario && (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Scenario · </span>
                {recap.scenario}
              </p>
            )}
            {recap.levelAssessment && (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Level · </span>
                {recap.levelAssessment}
              </p>
            )}
          </div>
        )}

        {/* Summary */}
        {recap.summary && (
          <div className="flex gap-2">
            <HugeiconsIcon icon={NoteIcon} size={13} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{recap.summary}</p>
          </div>
        )}

        {/* Divider */}
        {(recap.strengths.length > 0 || recap.weaknesses.length > 0) && (
          <div className="border-t border-border" />
        )}

        {/* Strengths / Weaknesses */}
        {(recap.strengths.length > 0 || recap.weaknesses.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={12} className="text-muted-foreground" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Strengths
                </p>
              </div>
              {recap.strengths.length > 0 ? (
                <ul className="space-y-1">
                  {recap.strengths.slice(0, 3).map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-xs text-foreground">
                      <span className="mt-1.5 size-1 rounded-full bg-foreground/40 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None captured.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={AlertCircleIcon} size={12} className="text-muted-foreground" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  To improve
                </p>
              </div>
              {recap.weaknesses.length > 0 ? (
                <ul className="space-y-1">
                  {recap.weaknesses.slice(0, 3).map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-xs text-foreground">
                      <span className="mt-1.5 size-1 rounded-full bg-foreground/40 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None captured.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export function ChatMessages({
  messages,
  isThinking,
  isSessionActive = false,
  showStarterCards = false,
  starterTopics = [],
  topicsLoading = false,
  topicsSource = null,
  onPickStarterTopicAction,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showStarterCards, starterTopics.length, topicsLoading]);

  return (
    <div className="flex-1 overflow-y-auto py-8">
      <div className="w-full max-w-5xl mx-auto px-6 space-y-6">
        {messages.map((message) => {
          const isUser = message.role === "user";

          // Hide the init trigger
          const isInit =
            isUser &&
            message.parts.every(
              (p) => p.type !== "text" || (p as { type: "text"; text: string }).text.trim() === "__INIT__",
            );
          if (isInit) return null;

          return (
            <div key={message.id}>
              {/* ── User message ── */}
              {isUser && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed">
                    {message.parts
                      .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text.trim())
                      .map((p, i) => <span key={i}>{p.text}</span>)}
                  </div>
                </div>
              )}

              {/* ── Assistant message ── */}
              {!isUser && (
                <div className="space-y-4">
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      const displayText = stripExpressionTags(part.text);
                      if (!displayText) return null;
                      return (
                        <p key={i} className="text-sm leading-relaxed text-foreground">
                          {displayText}
                        </p>
                      );
                    }

                    if ((part as { type: string }).type === "session-recap") {
                      const r = part as unknown as EndSessionRecap;
                      return <RecapCard key={i} recap={r} label="Session recap" />;
                    }

                    if (part.type.startsWith("tool-")) {
                      const label = getToolLabel(part);
                      const toolPart = part as {
                        type: string;
                        state?: string;
                        input?: unknown;
                        output?: unknown;
                      };
                      const isDone = toolPart.state === "output-available";
                      // Only show live recap while streaming (before message is persisted with session-recap part)
                      const recap = isDone ? getEndSessionRecap(toolPart) : null;

                      return (
                        <div key={i} className="space-y-4">
                          {label && (
                            <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                              {!isDone && <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin" />}
                              {label}
                            </p>
                          )}
                          {recap && <RecapCard recap={recap} label="Session recap" />}
                        </div>
                      );
                    }

                    return null;
                  })}

                  {/* Topic cards */}
                  {showStarterCards && message.id === lastAssistantMessageId && (
                    <div className="pt-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <HugeiconsIcon icon={SparklesIcon} size={12} />
                          Pick a topic to start
                        </p>
                        {topicsSource && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50">
                            {topicsSource === "ai" ? "AI" : "Fallback"}
                          </span>
                        )}
                      </div>
                      {topicsLoading && starterTopics.length === 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {[0, 1].map((i) => (
                            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 animate-pulse">
                              <div className="h-3.5 w-3/4 rounded bg-muted-foreground/20" />
                              <div className="mt-2 h-2.5 w-full rounded bg-muted-foreground/10" />
                              <div className="mt-1 h-2.5 w-2/3 rounded bg-muted-foreground/10" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {starterTopics.map((topic) => (
                            <button
                              key={topic.title}
                              type="button"
                              onClick={() => onPickStarterTopicAction?.(topic.title)}
                              className="rounded-xl border border-border bg-card px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              <p className="text-sm font-medium">{topic.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">{topic.subtitle}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex gap-1 items-center py-1">
            <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
