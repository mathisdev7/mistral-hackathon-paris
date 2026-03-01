"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateUser, useSession } from "@/lib/auth-client";
import { LANGUAGES, type TutorLanguageMode } from "@/lib/types";

const STEPS = ["language", "motivation", "mode"] as const;
type Step = (typeof STEPS)[number];

const NATIVE_LANGUAGES = [
  { value: "English", label: "English" },
  { value: "French", label: "French" },
  { value: "Spanish", label: "Spanish" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Arabic", label: "Arabic" },
  { value: "Chinese", label: "Chinese" },
  { value: "Japanese", label: "Japanese" },
  { value: "Russian", label: "Russian" },
];

export function OnboardingForm() {
  const router = useRouter();
  const { data: session } = useSession();

  const [step, setStep] = useState<Step>("language");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const [motivation, setMotivation] = useState("");
  const [tutorLanguageMode, setTutorLanguageMode] = useState<TutorLanguageMode>("native");
  const [saving, setSaving] = useState(false);

  // Pre-fill from existing profile if user is coming back to update
  useEffect(() => {
    if (!session?.user) return;
    const u = session.user as typeof session.user & {
      targetLanguage?: string;
      nativeLanguage?: string;
      motivation?: string;
      tutorLanguageMode?: TutorLanguageMode;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (u.targetLanguage) setTargetLanguage(u.targetLanguage);
    if (u.nativeLanguage) setNativeLanguage(u.nativeLanguage);
    if (u.motivation) setMotivation(u.motivation);
    if (u.tutorLanguageMode) setTutorLanguageMode(u.tutorLanguageMode);
  }, [session]);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  async function handleFinish() {
    setSaving(true);
    await updateUser({
      // @ts-expect-error — better-auth additionalFields are typed at runtime
      targetLanguage,
      nativeLanguage,
      motivation,
      tutorLanguageMode,
    });
    router.push("/chat");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (step === "language" && targetLanguage) setStep("motivation");
    }
  }

  const name = session?.user?.name ?? "there";

  return (
    <div className="w-full max-w-lg">
      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>Step {stepIndex + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step: Language */}
      {step === "language" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Language</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              What do you want to learn, {name}?
            </h1>
            <p className="text-muted-foreground">Pick the language you&apos;d like to practice.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                onClick={() => setTargetLanguage(lang.value)}
                onKeyDown={handleKeyDown}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all hover:border-primary/50 hover:bg-accent/50 ${
                  targetLanguage === lang.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border"
                }`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Your native language</label>
            <Select value={nativeLanguage} onValueChange={(v) => v && setNativeLanguage(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NATIVE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => setStep("motivation")}
            disabled={!targetLanguage}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step: Motivation */}
      {step === "motivation" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Step 2</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Why are you learning {targetLanguage}?
            </h1>
            <p className="text-muted-foreground">
              This helps your tutor tailor scenarios to what matters to you. Feel free to skip.
            </p>
          </div>

          <Textarea
            autoFocus
            placeholder="e.g. I'm moving to Paris next year and want to feel confident in everyday situations…"
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
          />

          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep("language")}>
              Back
            </Button>
            <Button size="lg" className="flex-1" onClick={() => setStep("mode")}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step: Tutor language mode */}
      {step === "mode" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Almost there</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              How should your tutor speak?
            </h1>
            <p className="text-muted-foreground">
              Choose how the AI communicates with you outside of practice sessions.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setTutorLanguageMode("native")}
              className={`w-full flex flex-col gap-1 rounded-xl border px-5 py-4 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
                tutorLanguageMode === "native"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <span className={`text-sm font-semibold ${tutorLanguageMode === "native" ? "text-primary" : ""}`}>
                Native language outside sessions
              </span>
              <span className="text-sm text-muted-foreground">
                The tutor speaks {nativeLanguage} for explanations, greetings, and recaps — and switches to {targetLanguage} only during roleplay sessions.
              </span>
            </button>

            <button
              onClick={() => setTutorLanguageMode("immersive")}
              className={`w-full flex flex-col gap-1 rounded-xl border px-5 py-4 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
                tutorLanguageMode === "immersive"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <span className={`text-sm font-semibold ${tutorLanguageMode === "immersive" ? "text-primary" : ""}`}>
                Always {targetLanguage} — full immersion
              </span>
              <span className="text-sm text-muted-foreground">
                The tutor speaks {targetLanguage} at all times, even outside sessions. Best for intermediate learners who want maximum exposure.
              </span>
            </button>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep("motivation")}>
              Back
            </Button>
            <Button size="lg" className="flex-1" onClick={handleFinish} disabled={saving}>
              {saving ? "Saving…" : "Start learning"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
