import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding-form";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/sign-in");

  // If profile is already complete, skip onboarding
  const user = session.user as typeof session.user & {
    targetLanguage?: string;
  };
  if (user.targetLanguage) redirect("/chat");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <OnboardingForm />
    </main>
  );
}
