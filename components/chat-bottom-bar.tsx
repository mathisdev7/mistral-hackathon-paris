"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, StopIcon, SentIcon, VoiceIcon, KeyboardIcon } from "@hugeicons/core-free-icons";
import { useRef, useState, useEffect, useCallback } from "react";

import { LANGUAGE_LOCALE_MAP } from "@/lib/types";

type InputMode = "voice" | "text";
type VoiceMode = "toggle" | "auto";

type Props = {
  isThinking: boolean;
  onSendTextAction: (text: string) => void | Promise<void>;
  isSessionActive: boolean;
  targetLanguage: string;
};

// Silence detection config for auto mode
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 2000;

export function ChatBottomBar({
  isThinking,
  onSendTextAction,
  isSessionActive,
  targetLanguage,
}: Props) {
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("toggle");

  // Restore persisted preferences after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    const savedInputMode = localStorage.getItem("inputMode") as InputMode | null;
    const savedVoiceMode = localStorage.getItem("voiceMode") as VoiceMode | null;
    if (savedInputMode) setInputMode(savedInputMode);
    if (savedVoiceMode) setVoiceMode(savedVoiceMode);
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle-mode refs
  const toggleRecorderRef = useRef<MediaRecorder | null>(null);
  const toggleStreamRef = useRef<MediaStream | null>(null);
  const toggleChunksRef = useRef<Blob[]>([]);

  // Auto-mode persistent refs
  const autoStreamRef = useRef<MediaStream | null>(null);
  const autoAudioCtxRef = useRef<AudioContext | null>(null);
  const autoAnalyserRef = useRef<AnalyserNode | null>(null);
  const autoRecorderRef = useRef<MediaRecorder | null>(null);
  const autoChunksRef = useRef<Blob[]>([]);
  const autoActiveRef = useRef(false);

  // Silence-detection
  const silenceRafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);

  // Resolvers waiting for isThinking to become false
  const thinkingDoneResolversRef = useRef<Array<() => void>>([]);

  const isThinkingRef = useRef(isThinking);
  useEffect(() => {
    isThinkingRef.current = isThinking;
    if (!isThinking) {
      const resolvers = thinkingDoneResolversRef.current.splice(0);
      for (const resolve of resolvers) resolve();
    }
  }, [isThinking]);

  // ─── wait for AI to finish ────────────────────────────────────────────────

  function waitForThinkingDone(): Promise<void> {
    if (!isThinkingRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      thinkingDoneResolversRef.current.push(resolve);
    });
  }

  // ─── silence detection ────────────────────────────────────────────────────

  function stopSilenceLoop() {
    if (silenceRafRef.current !== null) {
      cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    silenceStartRef.current = null;
  }

  const startSilenceLoop = useCallback(() => {
    if (!autoAnalyserRef.current) return;

    const dataArray = new Float32Array(autoAnalyserRef.current.fftSize);

    function tick() {
      if (!autoAnalyserRef.current || !autoActiveRef.current) return;

      autoAnalyserRef.current.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / dataArray.length);
      const isSilent = rms < SILENCE_THRESHOLD;

      if (isSilent) {
        if (silenceStartRef.current === null) silenceStartRef.current = Date.now();
        const elapsed = Date.now() - silenceStartRef.current;

        if (elapsed >= SILENCE_DURATION_MS) {
          if (!speechDetectedRef.current) {
            silenceStartRef.current = null;
          } else {
            stopSilenceLoop();
            void handleAutoUtterance();
            return;
          }
        }
      } else {
        speechDetectedRef.current = true;
        silenceStartRef.current = null;
      }

      silenceRafRef.current = requestAnimationFrame(tick);
    }

    silenceRafRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── auto-mode utterance cycle ────────────────────────────────────────────

  async function handleAutoUtterance() {
    const recorder = autoRecorderRef.current;
    if (!recorder || !autoActiveRef.current) return;

    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    // Force flush buffered audio before stopping (helps auto mode on some browsers).
    try { recorder.requestData(); } catch { /* ignore */ }
    recorder.stop();
    await stopped;

    const blobType = autoChunksRef.current[0]?.type || "audio/webm";
    const blob = new Blob(autoChunksRef.current, { type: blobType });
    autoChunksRef.current = [];
    autoRecorderRef.current = null;

    if (blob.size > 0) {
      setIsTranscribing(true);
      setRecordingError(null);

      try {
        const formData = new FormData();
        formData.append("audio", new File([blob], "recording.webm", { type: blob.type }));
        formData.append("language", LANGUAGE_LOCALE_MAP[targetLanguage] ?? "en");

        const response = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (!response.ok) throw new Error("Transcription failed");

        const data = (await response.json()) as { text?: string };
        const transcribed = (data.text ?? "").trim();

        if (transcribed) {
          await onSendTextAction(transcribed);
          await waitForThinkingDone();
        }
      } catch {
        setRecordingError("Could not transcribe audio. Please try again.");
      } finally {
        setIsTranscribing(false);
      }
    }

    if (!autoActiveRef.current || !autoStreamRef.current) return;

    const newRecorder = new MediaRecorder(autoStreamRef.current);
    newRecorder.ondataavailable = (e) => { if (e.data.size > 0) autoChunksRef.current.push(e.data); };
    newRecorder.start();
    autoRecorderRef.current = newRecorder;
    autoChunksRef.current = [];
    speechDetectedRef.current = false;

    startSilenceLoop();
  }

  // ─── start / stop auto mode ───────────────────────────────────────────────

  async function startAutoMode() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      setRecordingError(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      autoStreamRef.current = stream;
      autoActiveRef.current = true;

      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      autoAudioCtxRef.current = ctx;
      autoAnalyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) autoChunksRef.current.push(e.data); };
      // Timeslice improves chunk delivery reliability across browsers.
      recorder.start(250);
      autoRecorderRef.current = recorder;
      autoChunksRef.current = [];
      speechDetectedRef.current = false;

      setIsRecording(true);
      startSilenceLoop();
    } catch {
      setRecordingError("Microphone permission denied or unavailable.");
      autoStreamRef.current?.getTracks().forEach((t) => t.stop());
      autoStreamRef.current = null;
      autoActiveRef.current = false;
    }
  }

  function stopAutoMode() {
    autoActiveRef.current = false;
    stopSilenceLoop();

    autoRecorderRef.current?.stop();
    autoRecorderRef.current = null;
    autoChunksRef.current = [];

    autoStreamRef.current?.getTracks().forEach((t) => t.stop());
    autoStreamRef.current = null;

    if (autoAudioCtxRef.current) {
      void autoAudioCtxRef.current.close();
      autoAudioCtxRef.current = null;
    }
    autoAnalyserRef.current = null;

    setIsRecording(false);
  }

  // ─── toggle-mode recording ────────────────────────────────────────────────

  async function startToggleRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      toggleStreamRef.current = stream;
      toggleChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) toggleChunksRef.current.push(e.data); };
      // Timeslice improves chunk delivery reliability across browsers.
      recorder.start(250);
      toggleRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone permission denied or unavailable.");
      toggleStreamRef.current?.getTracks().forEach((t) => t.stop());
      toggleStreamRef.current = null;
    }
  }

  async function stopToggleRecordingAndTranscribe() {
    const recorder = toggleRecorderRef.current;
    if (!recorder) return;

    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.stop();
    setIsRecording(false);
    await stopped;

    const blobType = toggleChunksRef.current[0]?.type || "audio/webm";
    const blob = new Blob(toggleChunksRef.current, { type: blobType });
    toggleChunksRef.current = [];
    toggleStreamRef.current?.getTracks().forEach((t) => t.stop());
    toggleStreamRef.current = null;
    toggleRecorderRef.current = null;

    if (blob.size === 0) {
      setRecordingError("No audio captured. Please try again and speak a bit longer.");
      return;
    }

    setIsTranscribing(true);
    setRecordingError(null);

    try {
      const formData = new FormData();
      formData.append("audio", new File([blob], "recording.webm", { type: blob.type }));
      formData.append("language", LANGUAGE_LOCALE_MAP[targetLanguage] ?? "en");

      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Transcription failed");

      const data = (await response.json()) as { text?: string };
      const transcribed = (data.text ?? "").trim();
      if (transcribed) {
        // Toggle mode should behave like voice mode: send immediately.
        await onSendTextAction(transcribed);
      }
    } catch {
      setRecordingError("Could not transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  }

  // ─── stop all recording ───────────────────────────────────────────────────

  function stopAllRecording() {
    if (voiceMode === "auto") stopAutoMode();
    else {
      toggleRecorderRef.current?.stop();
      toggleStreamRef.current?.getTracks().forEach((t) => t.stop());
      toggleRecorderRef.current = null;
      toggleStreamRef.current = null;
      toggleChunksRef.current = [];
      setIsRecording(false);
    }
    setRecordingError(null);
  }

  // ─── cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopAutoMode();
      toggleRecorderRef.current?.stop();
      toggleStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── button handlers ──────────────────────────────────────────────────────

  async function handleRecordToggle() {
    if (isTranscribing) return;

    if (voiceMode === "toggle") {
      if (isThinking) return;
      if (isRecording) await stopToggleRecordingAndTranscribe();
      else await startToggleRecording();
      return;
    }

    if (isRecording) stopAutoMode();
    else await startAutoMode();
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isThinking || isTranscribing) return;
    await onSendTextAction(trimmed);
    setText("");
    inputRef.current?.focus();
  }

  function handleVoiceModeSwitch(mode: VoiceMode) {
    if (mode === voiceMode) return;
    if (isRecording) {
      if (voiceMode === "auto") stopAutoMode();
      else void stopToggleRecordingAndTranscribe();
    }
    setVoiceMode(mode);
    localStorage.setItem("voiceMode", mode);
  }

  function handleInputModeSwitch(mode: InputMode) {
    if (mode === inputMode) return;
    if (isRecording) stopAllRecording();
    setInputMode(mode);
    localStorage.setItem("inputMode", mode);
    if (mode === "text") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  // ─── derived state ────────────────────────────────────────────────────────

  const sendDisabled = !text.trim() || isThinking || isTranscribing;

  const micLabel =
    voiceMode === "auto"
      ? isRecording ? "Stop auto-recording" : "Start auto-recording"
      : isRecording ? "Stop recording" : "Record voice";

  const statusText = (() => {
    if (recordingError) return recordingError;
    if (isTranscribing) return "Transcribing your audio…";
    if (isRecording && voiceMode === "toggle") return "Recording in progress…";
    return null;
  })();

  const micDisabled = voiceMode === "auto" ? isTranscribing : isThinking || isTranscribing;

  return (
    <div
      className={`border-t px-4 py-4 shrink-0 transition-colors ${
        isSessionActive ? "border-emerald-500/30 bg-emerald-500/5" : ""
      }`}
    >
      <div className="w-full max-w-xl mx-auto space-y-2">

        {/* ── Top bar: input mode switcher (left) + voice mode switcher (right, voice only) ── */}
        <div className="flex items-center justify-between">
          {/* Input mode pill */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            <button
              onClick={() => handleInputModeSwitch("voice")}
              aria-label="Voice input"
              title="Voice input"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                inputMode === "voice"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HugeiconsIcon icon={Mic01Icon} size={11} />
              Voice
            </button>
            <button
              onClick={() => handleInputModeSwitch("text")}
              aria-label="Text input"
              title="Text input"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                inputMode === "text"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HugeiconsIcon icon={KeyboardIcon} size={11} />
              Text
            </button>
          </div>

          {/* Voice mode switcher — only visible in voice mode */}
          {inputMode === "voice" && (
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              <button
                onClick={() => handleVoiceModeSwitch("toggle")}
                aria-label="Toggle mode"
                title="Press to record, press to stop"
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  voiceMode === "toggle"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HugeiconsIcon icon={Mic01Icon} size={11} />
                Toggle
              </button>
              <button
                onClick={() => handleVoiceModeSwitch("auto")}
                aria-label="Auto mode"
                title="One click to start, auto-sends after 2s of silence"
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  voiceMode === "auto"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HugeiconsIcon icon={VoiceIcon} size={11} />
                Auto
              </button>
            </div>
          )}
        </div>

        {/* ── Voice input ── */}
        {inputMode === "voice" && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => void handleRecordToggle()}
              disabled={micDisabled}
              aria-label={micLabel}
              title={micLabel}
              className={`size-14 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors relative ${
                isRecording
                  ? voiceMode === "auto"
                    ? "bg-violet-600 text-white hover:bg-violet-600/90"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {isRecording && voiceMode === "auto" && (
                <span className="absolute inset-0 rounded-full animate-ping bg-violet-500/40 pointer-events-none" />
              )}
              {isRecording ? (
                voiceMode === "auto"
                  ? <HugeiconsIcon icon={VoiceIcon} size={22} />
                  : <HugeiconsIcon icon={StopIcon} size={22} />
              ) : voiceMode === "auto"
                ? <HugeiconsIcon icon={VoiceIcon} size={22} />
                : <HugeiconsIcon icon={Mic01Icon} size={22} />
              }
            </button>
          </div>
        )}

        {/* ── Text input ── */}
        {inputMode === "text" && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={isThinking || isTranscribing}
              placeholder="Type a message…"
              className={`flex-1 rounded-xl border bg-background px-4 py-2 text-sm outline-none focus:ring-2 disabled:opacity-50 placeholder:text-muted-foreground transition-colors ${
                isSessionActive
                  ? "border-emerald-500/40 focus:ring-emerald-500/40"
                  : "focus:ring-ring"
              }`}
            />
            <button
              onClick={() => void handleSend()}
              disabled={sendDisabled}
              aria-label="Send"
              className={`size-10 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 ${
                isSessionActive
                  ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              <HugeiconsIcon icon={SentIcon} size={16} />
            </button>
          </div>
        )}

        {/* ── Status text ── */}
        {statusText && (
          <p
            className={`text-xs text-center ${
              recordingError
                ? "text-destructive"
                : isRecording
                  ? "text-emerald-700"
                  : "text-muted-foreground"
            }`}
          >
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}
