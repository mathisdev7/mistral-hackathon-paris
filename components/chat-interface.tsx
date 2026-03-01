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

function canonicalizeSpeechText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
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
  const initialLastAssistant = [...initialMessages].reverse().find((m) => m.role === "assistant") ?? null;
  const initialLastAssistantText = initialLastAssistant ? extractAssistantText(initialLastAssistant) : "";
  const initialLastAssistantSignature = initialLastAssistant
    ? `${initialLastAssistant.id}:${canonicalizeSpeechText(initialLastAssistantText)}`
    : null;
  const lastSpokenSignatureRef = useRef<string | null>(initialLastAssistantSignature);
  const lastSpokenTextByMessageIdRef = useRef<Map<string, string>>(
    initialLastAssistant ? new Map([[initialLastAssistant.id, initialLastAssistantText]]) : new Map(),
  );
  const inFlightSignatureRef = useRef<string | null>(null);
  const inFlightCanonicalRef = useRef<string | null>(null);
  const recentlySpokenTextRef = useRef<{ canonical: string; at: number } | null>(null);
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

  const speakText = useCallback(async (text: string): Promise<boolean> => {
    if (!text) return false;

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
        return false;
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
      return true;
    } catch {
      setIsSpeaking(false);
      onTtsDoneRef.current?.();
      return false;
    }
  }, [stopSpeaking, userProfile.voiceGender]);

  // Watch for new assistant messages and auto-play TTS.
  // Special case: allow the final closing line to be spoken while end_session is still saving.
  useEffect(() => {
    if (!ttsEnabled) return;

    // Find the last assistant message
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const hasPendingEndSessionSave = lastAssistant.parts.some(
      (part) =>
        part.type === "tool-end_session" &&
        (part as { state?: string }).state !== "output-available",
    );

    // Normally wait for completion; except for end-session closing line.
    if (isThinking && !hasPendingEndSessionSave) return;

    const fullText = extractAssistantText(lastAssistant);
    if (!fullText) return;

    const previousTextForMessage = lastSpokenTextByMessageIdRef.current.get(lastAssistant.id) ?? "";
    const text =
      previousTextForMessage && fullText.startsWith(previousTextForMessage)
        ? fullText.slice(previousTextForMessage.length).trim()
        : fullText;
    if (!text) return;

    const canonical = canonicalizeSpeechText(text);
    const signature = `${lastAssistant.id}:${canonical}`;

    // Don't re-speak a message we already spoke or are currently speaking.
    if (lastSpokenSignatureRef.current === signature) return;
    if (inFlightSignatureRef.current === signature) return;
    if (inFlightCanonicalRef.current === canonical) return;

    // Guard against recap-related duplicate text in a follow-up assistant message.
    const recent = recentlySpokenTextRef.current;
    if (recent && Date.now() - recent.at < 20000 && recent.canonical === canonical) return;

    inFlightSignatureRef.current = signature;
    inFlightCanonicalRef.current = canonical;

    // Mark as spoken only after playback starts successfully.
    void (async () => {
      const started = await speakText(text);
      if (started) {
        lastSpokenSignatureRef.current = signature;
        lastSpokenTextByMessageIdRef.current.set(lastAssistant.id, fullText);
        recentlySpokenTextRef.current = { canonical, at: Date.now() };
      }
      if (inFlightSignatureRef.current === signature) inFlightSignatureRef.current = null;
      if (inFlightCanonicalRef.current === canonical) inFlightCanonicalRef.current = null;
    })();
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
