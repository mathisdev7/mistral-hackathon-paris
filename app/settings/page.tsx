import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { SettingsForm } from "@/components/settings-form";
import type { TutorLanguageMode, VoiceGender } from "@/lib/types";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const user = session.user as typeof session.user & {
    targetLanguage?: string;
    nativeLanguage?: string;
    motivation?: string;
    tutorLanguageMode?: TutorLanguageMode;
    voiceGender?: VoiceGender;
  };

  return (
    <SettingsForm
      initialValues={{
        targetLanguage: user.targetLanguage ?? "",
        nativeLanguage: user.nativeLanguage ?? "English",
        motivation: user.motivation ?? "",
        tutorLanguageMode: user.tutorLanguageMode ?? "native",
        voiceGender: user.voiceGender ?? "female",
      }}
    />
  );
}
