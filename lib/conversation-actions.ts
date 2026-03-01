"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { conversation } from "@/db/schema";
import { auth } from "@/lib/auth";

/** Creates a conversation and immediately redirects to /chat/:id */
export async function createConversation(targetLanguage: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const [created] = await db
    .insert(conversation)
    .values({
      id: nanoid(),
      userId: session.user.id,
      title: "New conversation",
      targetLanguage,
    })
    .returning();

  redirect(`/chat/${created.id}`);
}

export async function deleteConversation(id: string): Promise<{ error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  await db
    .delete(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, session.user.id)));

  revalidatePath("/chat");
  return {};
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<{ error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const trimmed = title.trim();
  if (!trimmed) return { error: "Title cannot be empty" };

  await db
    .update(conversation)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(and(eq(conversation.id, id), eq(conversation.userId, session.user.id)));

  revalidatePath("/chat");
  return {};
}
