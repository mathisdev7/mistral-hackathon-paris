import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  Medal01Icon,
  BrainIcon,
} from "@hugeicons/core-free-icons";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { conversation } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getUserMemory } from "@/lib/memory";

export default async function MemoryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const memory = await getUserMemory(session.user.id);

  const recapRows = await db
    .select({ recap: conversation.sessionRecap, updatedAt: conversation.updatedAt })
    .from(conversation)
    .where(eq(conversation.userId, session.user.id))
    .orderBy(desc(conversation.updatedAt))
    .limit(20);

  const recaps = recapRows
    .map((r) => r.recap)
    .filter((r): r is NonNullable<typeof r> => !!r);

  const latestRecap = recaps[0] ?? null;

  const uniqueList = (items: string[]) =>
    Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));

  // Prefer curated Supermemory lists; fallback to latest recap when unavailable.
  const displayLevel = memory?.levelAssessment ?? latestRecap?.levelAssessment ?? null;
  const displayStrengths = uniqueList([
    ...(memory?.strengths ?? []),
    ...(latestRecap?.strengths ?? []),
  ]).slice(0, 8);
  const displayWeaknesses = uniqueList([
    ...(memory?.weaknesses ?? []),
    ...(latestRecap?.weaknesses ?? []),
  ]).slice(0, 6);

  const hasProfile = !!(displayLevel || displayStrengths.length > 0 || displayWeaknesses.length > 0);
  const hasSessions = !!memory && memory.sessions.length > 0;
  const hasMemory = hasProfile || hasSessions;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {/* Nav */}
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-muted-foreground hover:text-foreground transition-colors">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} />
          </Link>
          <span className="text-sm font-medium">AI Memory</span>
        </div>

        {!hasMemory ? (
          <div className="rounded-2xl border bg-card px-6 py-14 text-center space-y-3">
            <HugeiconsIcon icon={BrainIcon} size={32} className="mx-auto text-muted-foreground/30" />
            <p className="text-sm font-medium">No memories yet</p>
            <p className="text-sm text-muted-foreground">
              Complete a few sessions and the AI will build your learner profile.
            </p>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Start practicing
            </Link>
          </div>
        ) : (
          <>
            {/* Level */}
            {displayLevel && (
              <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <HugeiconsIcon icon={Medal01Icon} size={16} className="text-primary shrink-0" />
                <span className="text-sm text-muted-foreground">Level</span>
                <span className="text-sm font-medium ml-auto">{displayLevel}</span>
              </div>
            )}

            {/* Strengths & Weaknesses */}
            {(displayStrengths.length > 0 || displayWeaknesses.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} size={13} className="text-green-500" />
                    Strengths
                  </div>
                  {displayStrengths.length > 0 ? (
                    <ul className="space-y-1.5">
                      {displayStrengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 size-1.5 rounded-full bg-green-500 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">None yet</p>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <HugeiconsIcon icon={AlertCircleIcon} size={13} className="text-primary" />
                    To work on
                  </div>
                  {displayWeaknesses.length > 0 ? (
                    <ul className="space-y-1.5">
                      {displayWeaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">None yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Session timeline */}
            {hasSessions && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <HugeiconsIcon icon={Clock01Icon} size={13} />
                  Recent sessions
                </div>
                <div className="border-l-2 border-border ml-1.5">
                  {[...memory.sessions].reverse().slice(0, 5).map((s, i) => (
                    <div key={i} className="pl-5 pb-5 relative last:pb-0">
                      <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-primary" />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{s.scenario}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{s.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
