import { Plus, Brain } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ChatView } from "@/components/chat-interface";
import { ConversationSidebar } from "@/components/conversation-sidebar";
import { auth } from "@/lib/auth";
import { createConversation } from "@/lib/conversation-actions";
import { getUserMemory } from "@/lib/memory";
import { getConversations, getConversationWithMessages } from "@/lib/queries";

import type { UIMessage } from "ai";

type StoredMessage = { id: string; role: string; parts: unknown[] };

function toUIMessages(stored: StoredMessage[]): UIMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts as UIMessage["parts"],
  }));
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id?: string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const user = session.user as typeof session.user & {
    targetLanguage: string;
    nativeLanguage: string;
    motivation: string;
    tutorLanguageMode: string;
  };

  const { id } = await params;
  const conversationId = id?.[0] ?? null;

  // Fetch data on the server
  const conversations = await getConversations(user.id);
  const conversationData = conversationId
    ? await getConversationWithMessages(user.id, conversationId)
    : null;

  const initialMessages = conversationData?.messages?.length
    ? toUIMessages(conversationData.messages as StoredMessage[])
    : [];

  // Fetch memory summary for the empty state panel
  const memory = await getUserMemory(user.id);
  const hasMemory =
    !!memory &&
    (!!memory.levelAssessment ||
      memory.strengths.length > 0 ||
      memory.weaknesses.length > 0 ||
      memory.sessions.length > 0);
  const recentSessions = memory ? [...memory.sessions].reverse().slice(0, 3) : [];

  // Serialize conversations for the client
  const serializedConversations = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    targetLanguage: c.targetLanguage,
    updatedAt: c.updatedAt.toISOString(),
  }));

  const userProfile = {
    name: user.name,
    image: user.image ?? null,
    targetLanguage: user.targetLanguage ?? "",
    nativeLanguage: user.nativeLanguage ?? "",
    motivation: user.motivation ?? "",
    tutorLanguageMode: (user.tutorLanguageMode ?? "native") as import("@/lib/types").TutorLanguageMode,
  };



  async function createConversationAction() {
    "use server";
    await createConversation(userProfile.targetLanguage);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ConversationSidebar
        conversations={serializedConversations}
        activeId={conversationId}
        userProfile={userProfile}
      />
      <div className="flex-1 min-w-0">
        {conversationId ? (
          <ChatView
            key={conversationId}
            conversationId={conversationId}
            initialMessages={initialMessages}
            userProfile={userProfile}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-4xl rounded-2xl border bg-card p-6 md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Start your next session</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Jump into a new conversation and review your learning memory at a glance.
                  </p>
                </div>
                <form action={createConversationAction}>
                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="size-4" />
                    New conversation
                  </Button>
                </form>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border bg-muted/30 p-5">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Brain className="size-4 text-primary" />
                    Learner profile
                  </p>
                  {!hasMemory ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No memories yet. Complete a few sessions and the AI will build your learner profile.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3 text-sm">
                      <p>
                        <span className="text-muted-foreground">Level assessment:</span>{" "}
                        {memory?.levelAssessment ?? "Not assessed yet"}
                      </p>
                      <div>
                        <p className="text-muted-foreground">Strengths</p>
                        {memory && memory.strengths.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {memory.strengths.slice(0, 5).map((strength, index) => (
                              <li key={index}>• {strength}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1">No strengths recorded yet.</p>
                        )}
                      </div>
                      <div>
                        <p className="text-muted-foreground">Areas to improve</p>
                        {memory && memory.weaknesses.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {memory.weaknesses.slice(0, 5).map((weakness, index) => (
                              <li key={index}>• {weakness}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1">No weaknesses recorded yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border bg-muted/30 p-5">
                  <p className="text-sm font-medium">Recent sessions</p>
                  {!hasMemory || recentSessions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No sessions yet. Your completed practice sessions will appear here.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {recentSessions.map((session, index) => (
                        <article key={index} className="rounded-lg border bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium">{session.scenario}</p>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {new Date(session.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{session.summary}</p>
                        </article>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Total saved sessions: {memory?.sessions.length ?? 0}
                  </p>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
