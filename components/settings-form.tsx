"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateUser } from "@/lib/auth-client";
import { LANGUAGES, type TutorLanguageMode, type VoiceGender } from "@/lib/types";

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

type Props = {
  initialValues: {
    targetLanguage: string;
    nativeLanguage: string;
    motivation: string;
    tutorLanguageMode: TutorLanguageMode;
    voiceGender: VoiceGender;
  };
};

export function SettingsForm({ initialValues }: Props) {
  const router = useRouter();

  const [targetLanguage, setTargetLanguage] = useState(initialValues.targetLanguage);
  const [nativeLanguage, setNativeLanguage] = useState(initialValues.nativeLanguage);
  const [motivation, setMotivation] = useState(initialValues.motivation);
  const [tutorLanguageMode, setTutorLanguageMode] = useState<TutorLanguageMode>(initialValues.tutorLanguageMode);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(initialValues.voiceGender);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    targetLanguage !== initialValues.targetLanguage ||
    nativeLanguage !== initialValues.nativeLanguage ||
    motivation !== initialValues.motivation ||
    tutorLanguageMode !== initialValues.tutorLanguageMode ||
    voiceGender !== initialValues.voiceGender;

  async function handleSave() {
    if (!targetLanguage) return;
    setSaving(true);
    setSaved(false);
    await updateUser({
      // @ts-expect-error — better-auth additionalFields are typed at runtime
      targetLanguage,
      nativeLanguage,
      motivation,
      tutorLanguageMode,
      voiceGender,
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {/* Nav */}
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-muted-foreground hover:text-foreground transition-colors">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} />
          </Link>
          <span className="text-sm font-medium">Settings</span>
        </div>

        {/* Language to learn */}
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-medium">Language to learn</h2>
            <p className="text-xs text-muted-foreground">The language your AI tutor will practice with you.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                onClick={() => setTargetLanguage(lang.value)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all hover:border-primary/50 hover:bg-accent/50 ${
                  targetLanguage === lang.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border"
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Native language */}
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-medium">Native language</h2>
            <p className="text-xs text-muted-foreground">Used for explanations and feedback outside sessions.</p>
          </div>
          <Select value={nativeLanguage} onValueChange={(v) => v && setNativeLanguage(v)}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NATIVE_LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* Motivation */}
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-medium">Motivation</h2>
            <p className="text-xs text-muted-foreground">Helps the AI tailor scenarios to what matters to you.</p>
          </div>
          <Textarea
            placeholder="e.g. I'm moving to Paris next year and want to feel confident in everyday situations…"
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            className="resize-none"
            rows={3}
          />
        </section>

        {/* Tutor language mode */}
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-medium">Tutor language mode</h2>
            <p className="text-xs text-muted-foreground">How the AI speaks to you outside of roleplay sessions.</p>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => setTutorLanguageMode("native")}
              className={`w-full flex flex-col gap-1 rounded-xl border px-4 py-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
                tutorLanguageMode === "native" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className={`text-sm font-medium ${tutorLanguageMode === "native" ? "text-primary" : ""}`}>
                Native language outside sessions
              </span>
              <span className="text-xs text-muted-foreground">
                Speaks {nativeLanguage} for greetings and explanations, {targetLanguage || "target language"} during roleplay.
              </span>
            </button>

            <button
              onClick={() => setTutorLanguageMode("immersive")}
              className={`w-full flex flex-col gap-1 rounded-xl border px-4 py-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
                tutorLanguageMode === "immersive" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className={`text-sm font-medium ${tutorLanguageMode === "immersive" ? "text-primary" : ""}`}>
                Always {targetLanguage || "target language"}: full immersion
              </span>
              <span className="text-xs text-muted-foreground">
                Speaks {targetLanguage || "target language"} at all times, even outside sessions.
              </span>
            </button>
          </div>
        </section>

        {/* Voice */}
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-medium">Tutor voice</h2>
            <p className="text-xs text-muted-foreground">Choose the voice used for spoken replies.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => setVoiceGender("female")}
              className={`w-full flex flex-col gap-1 rounded-xl border px-4 py-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
                voiceGender === "female" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className={`text-sm font-medium ${voiceGender === "female" ? "text-primary" : ""}`}>
                Female
              </span>
              <span className="text-xs text-muted-foreground">Current default voice</span>
            </button>

            <button
              onClick={() => setVoiceGender("male")}
              className={`w-full flex flex-col gap-1 rounded-xl border px-4 py-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
                voiceGender === "male" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className={`text-sm font-medium ${voiceGender === "male" ? "text-primary" : ""}`}>
                Male
              </span>
              <span className="text-xs text-muted-foreground">ElevenLabs male voice</span>
            </button>
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty || !targetLanguage}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && !isDirty && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
        </div>

      </div>
    </div>
  );
}
