import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { conversation, message } from "@/db/schema";

/**
 * Fetch all conversations for a user, newest first.
 * This is a plain server function (not a server action) — called directly from server components.
 */
export async function getConversations(userId: string) {
  return db
    .select()
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt));
}

/**
 * Fetch a single conversation with all its messages, ordered by creation time.
 * Returns null if the conversation doesn't exist or doesn't belong to the user.
 */
export async function getConversationWithMessages(userId: string, id: string) {
  const conv = await db.query.conversation.findFirst({
    where: and(
      eq(conversation.id, id),
      eq(conversation.userId, userId),
    ),
  });
  if (!conv) return null;

  const messages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, id))
    .orderBy(asc(message.createdAt));

  return { conversation: conv, messages };
}


