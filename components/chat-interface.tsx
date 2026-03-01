"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

import type { UIMessage } from "ai";

import { ChatBottomBar } from "@/components/chat-bottom-bar";
import {
  ChatMessages,
  type TopicCard,
} from "@/components/chat-messages";
import { ChatHeader } from "@/components/chat-header";
import { generateSessionTopicsAction } from "@/lib/session-cards-actions";

export type UserProfile = {
  name: string;
  image: string | null;
  targetLanguage: string;
  nativeLanguage: string;
  motivation: string;
  tutorLanguageMode: "native" | "immersive";
  voiceGender: "female" | "male";
};

type Props = {
  conversationId: string;
  initialMessages: UIMessage[];
  userProfile: UserProfile;
};

const initSentFor = new Set<string>();

function getSessionActiveState(messages: UIMessage[]): boolean {
  let active = false;

  for (const message of messages) {
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-")) continue;
      if ((part as { state?: string }).state !== "output-available") continue;

      const toolName = part.type.replace(/^tool-/, "");
      if (toolName === "start_session") active = true;
      if (toolName === "end_session") active = false;
    }
  }

  return active;
}

/** Extract plain text from an assistant message's parts, stripping expression tags */
function extractAssistantText(message: UIMessage): string {
  if (message.role !== "assistant") return "";
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text.replace(/\[[\w\s]+\]/g, "").replace(/\s{2,}/g, " ").trim())
    .join(" ")
    .trim();
}

// ─── sessionStorage helpers ───────────────────────────────────────────────────

type CardsCache = {
  topics: TopicCard[];
  topicsSource: "ai" | "fallback" | null;
};

function readCardsCache(conversationId: string): CardsCache | null {
  try {
    const raw = sessionStorage.getItem(`cards:${conversationId}`);
    return raw ? (JSON.parse(raw) as CardsCache) : null;
  } catch {
    return null;
  }
}

function writeCardsCache(conversationId: string, data: CardsCache) {
  try {
    sessionStorage.setItem(`cards:${conversationId}`, JSON.stringify(data));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function ChatView({ conversationId, initialMessages, userProfile }: Props) {
  const isNewConversation = initialMessages.length === 0;
  const [starterTopics, setStarterTopics] = useState<TopicCard[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsSource, setTopicsSource] = useState<"ai" | "fallback" | null>(null);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialLastAssistantId = [...initialMessages].reverse().find((m) => m.role === "assistant")?.id ?? null;
  const lastSpokenMessageIdRef = useRef<string | null>(initialLastAssistantId);
  const onTtsDoneRef = useRef<(() => void) | null>(null);

  // Restore TTS preference after mount
  useEffect(() => {
    const saved = localStorage.getItem("ttsEnabled");
    if (saved !== null) setTtsEnabled(saved !== "false");
  }, []);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        userProfile: {
          name: userProfile.name,
          targetLanguage: userProfile.targetLanguage,
          nativeLanguage: userProfile.nativeLanguage,
          motivation: userProfile.motivation,
          tutorLanguageMode: userProfile.tutorLanguageMode,
        },
        conversationId,
      }),
    }),
    messages: initialMessages,
  });

  const isThinking = status === "streaming" || status === "submitted";
  const isSessionActive = getSessionActiveState(messages);

  // ─── TTS playback ──────────────────────────────────────────────────────────

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(async (text: string) => {
    if (!text) return;

    // Stop any currently playing audio
    stopSpeaking();

    setIsSpeaking(true);

    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceGender: userProfile.voiceGender }),
      });

      if (!response.ok) {
        setIsSpeaking(false);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setIsSpeaking(false);
        onTtsDoneRef.current?.();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setIsSpeaking(false);
        onTtsDoneRef.current?.();
      };

      await audio.play();
    } catch {
      setIsSpeaking(false);
      onTtsDoneRef.current?.();
    }
  }, [stopSpeaking]);

  // Watch for new completed assistant messages and auto-play TTS
  useEffect(() => {
    if (!ttsEnabled) return;
    if (isThinking) return; // wait until streaming is done

    // Find the last assistant message
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    // Don't re-speak a message we already spoke
    if (lastSpokenMessageIdRef.current === lastAssistant.id) return;

    const text = extractAssistantText(lastAssistant);
    if (!text) return;

    lastSpokenMessageIdRef.current = lastAssistant.id;
    void speakText(text);
  }, [messages, isThinking, ttsEnabled, speakText]);

  // Stop speaking when user sends a new message
  useEffect(() => {
    if (isThinking) stopSpeaking();
  }, [isThinking, stopSpeaking]);

  // ─── Bust the topics cache whenever a session ends ─────────────────────────

  const prevSessionActiveRef = useRef(isSessionActive);
  useEffect(() => {
    const wasActive = prevSessionActiveRef.current;
    prevSessionActiveRef.current = isSessionActive;
    if (wasActive && !isSessionActive) {
      // Session just ended — clear cached topics so new ones are generated
      try { sessionStorage.removeItem(`cards:${conversationId}`); } catch { /* ignore */ }
      setStarterTopics([]);
      setTopicsSource(null);
    }
  }, [isSessionActive, conversationId]);

  useEffect(() => {
    if (!isNewConversation) return;
    if (initSentFor.has(conversationId)) return;
    initSentFor.add(conversationId);
    sendMessage({ text: "__INIT__" });
  }, [isNewConversation, conversationId, sendMessage]);

  const shouldShowStarterCards =
    !isSessionActive && !isThinking && messages.some((m) => m.role === "assistant");

  // Load topics — serve from sessionStorage cache when available
  useEffect(() => {
    if (isSessionActive) return;
    if (!shouldShowStarterCards) return;

    // Check cache first — avoids re-fetching on reload
    const cached = readCardsCache(conversationId);
    if (cached) {
      setStarterTopics(cached.topics);
      setTopicsSource(cached.topicsSource);
      return;
    }

    let cancelled = false;

    async function loadTopics() {
      setTopicsLoading(true);

      const topicsData = await generateSessionTopicsAction({
        targetLanguage: userProfile.targetLanguage,
        motivation: userProfile.motivation,
      });

      if (cancelled) return;

      const topics = topicsData.topics.slice(0, 2);
      const source = topicsData.source ?? null;

      setStarterTopics(topics);
      setTopicsSource(source);
      setTopicsLoading(false);

      // Persist to sessionStorage so reloads are instant
      writeCardsCache(conversationId, { topics, topicsSource: source });
    }

    void loadTopics();

    return () => {
      cancelled = true;
    };
  }, [isSessionActive, shouldShowStarterCards, conversationId, userProfile.targetLanguage, userProfile.motivation]);

  function handleToggleTts() {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    localStorage.setItem("ttsEnabled", String(next));
    if (!next) stopSpeaking();
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <ChatHeader
        targetLanguage={userProfile.targetLanguage}
        userName={userProfile.name}
        isSessionActive={isSessionActive}
        ttsEnabled={ttsEnabled}
        onToggleTtsAction={handleToggleTts}
      />
      <ChatMessages
        messages={messages}
        isThinking={isThinking}
        isSessionActive={isSessionActive}
        showStarterCards={shouldShowStarterCards}
        starterTopics={isSessionActive ? [] : starterTopics}
        topicsLoading={isSessionActive ? false : topicsLoading}
        topicsSource={isSessionActive ? null : topicsSource}
        onPickStarterTopicAction={(title: string) =>
          sendMessage({
            text: `Yes, let's start now. I choose: ${title}.`,
          })
        }
      />

      {(messages.length > 0 || isThinking) && (
        <ChatBottomBar
          isThinking={isThinking}
          onSendTextAction={(t) => sendMessage({ text: t })}
          isSessionActive={isSessionActive}
          targetLanguage={userProfile.targetLanguage}
        />
      )}
    </div>
  );
}
