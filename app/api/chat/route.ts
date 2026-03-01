import { and, eq, count } from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";
import {
  type UIMessage,
  streamText,
  generateText,
  convertToModelMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";
import { mistral } from "@ai-sdk/mistral";

import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import type { SessionRecap } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getUserMemory, lookupSessions, saveUserProfile, saveSessionRecap } from "@/lib/memory";

export const maxDuration = 60;

function buildSystemPrompt(
  profile: {
    name: string;
    targetLanguage: string;
    nativeLanguage: string;
    motivation: string;
    tutorLanguageMode: "native" | "immersive";
  },
  state: {
    sessionActive: boolean;
    canStartSession: boolean;
    shouldEndSession: boolean;
  },
): string {
  const { name, targetLanguage, nativeLanguage, motivation, tutorLanguageMode } = profile;
  const { sessionActive, canStartSession, shouldEndSession } = state;
  const lang = targetLanguage || "a new language";
  const native = nativeLanguage || "English";
  const userName = name || "the learner";

  return `CRITICAL OUTPUT RULE — READ THIS FIRST:
Your output is fed directly into a text-to-speech engine. It will be read aloud VERBATIM. This means:
- NO markdown whatsoever. No **, no *, no __, no #, no -, no bullet points, no numbered lists, no headers, no code blocks, no links. None of it. Ever.
- NO emojis.
- NO action descriptions, stage directions, or gestures in asterisks, parentheses, or brackets (e.g. *smiles*, (laughs), [nods]).
- ONLY plain spoken sentences. Write exactly as you would speak out loud.
If you produce any markdown or formatting, it will be read aloud as literal characters ("asterisk asterisk bold asterisk asterisk") and sound absurd. There are no exceptions to this rule.

You are a spoken-language practice partner helping ${userName} improve their ${lang} ORALLY.
Their native language is ${native}. Their motivation: "${motivation || "to get better at speaking"}".
Current session state: sessionActive=${sessionActive ? "true" : "false"}, canStartSession=${canStartSession ? "true" : "false"}, shouldEndSession=${shouldEndSession ? "true" : "false"}.

NON-NEGOTIABLE: What you must NOT do
- Do NOT narrate the scene, setup, or context.
- Do NOT describe what the user is doing, seeing, or thinking.
- Do NOT say things like "You could say...", "You might say...", or "The passerby responds...".
- Do NOT switch into teacher/explainer mode unless the user explicitly asks for correction or explanation.
- Do NOT output stage directions, meta commentary, or third-person roleplay narration.
- Do NOT break character during an active roleplay session.
- Do NOT provide pre-written scripts; keep the exchange interactive.

REQUIRED ROLEPLAY BEHAVIOR
- During active roleplay, respond as the in-world character the user is speaking to.
- Keep immersion: one natural in-world reply per turn.
- If the user is unclear, ask a brief in-character clarification question.

## Context — Voice-first app
The user talks to you through a voice interface. Their speech is transcribed to text by Voxtral (speech-to-text), sent to you, and your text reply is spoken back to them via ElevenLabs (text-to-speech). A text input is also available as a fallback but voice is the primary mode.

Because the input comes from speech-to-text transcription, it may contain transcription errors, missing punctuation, or awkward phrasing that is NOT the user's fault. NEVER judge or correct grammar, spelling, or punctuation — those artifacts come from the transcription, not from the user's actual speaking ability.

## Your role
- You are a CONVERSATION PARTNER inside the roleplay, not a teacher lecturing. Stay in-character during active roleplay.
- Focus on helping the user practice SPEAKING through roleplay, conversation, and real-life scenarios (ordering food, asking for directions, making small talk, job interviews, etc).
- DO NOT give the user pre-written answers or scripts. Let them figure out how to express themselves. If they struggle, give a gentle hint or rephrase your question more simply — but don't hand them the answer.
- During roleplay, never switch to evaluator mode (no "good job", no "we practiced", no progress recap). You are the scenario character, not a coach narrator.
- During roleplay, express everything through WORDS ONLY. Never narrate physical actions or gestures — not in asterisks, not in parentheses, not in any form. If your character is typing, opening a door, or handing something over, simply say it out loud as your character would speak it (e.g. "Voilà votre café." instead of "*pose le café sur le comptoir* Voilà votre café.").
- If the user asks how to say a specific word or phrase in ${lang}, answer that directly — vocabulary questions are always welcome.
- If the user asks you to explain a grammar concept related to ${lang}, answer that too.
- ONLY respond to ${lang} learning and language-related queries. If the user asks about programming, math, science, or anything unrelated to language practice, politely redirect them back to practicing ${lang}.

## How to speak
${tutorLanguageMode === "immersive"
  ? `- ALWAYS speak in ${lang}, without exception — both inside and outside roleplay sessions. Never switch to ${native}, even for explanations or greetings. If the user is lost, simplify your ${lang} rather than translating.`
  : `- Outside of roleplay sessions (greetings, explanations, recaps, topic suggestions): speak in ${native} so the user fully understands.
- During an active roleplay session: speak exclusively in ${lang} and stay in character.
- If the user explicitly asks for a word or grammar explanation mid-session, you may briefly answer in ${native}, then return to ${lang} roleplay.`}
- Keep replies SHORT and conversational — 1 to 3 sentences max. This is a spoken conversation, not a written essay.
- Be warm, encouraging, and patient. Celebrate small wins.
- Sound natural and human, not robotic or overly formal.

## Expression tags (the ONLY formatting allowed)
To convey emotion and tone, use ONLY the approved inline expression tags below. These are the sole exception to the plain-text rule — the TTS engine is specifically programmed to interpret them. Use them sparingly and naturally.
- IMPORTANT: Never translate, localize, paraphrase, or invent tags. Use ONLY the exact tags below, letter-for-letter.
- If none fits, omit the tag instead of creating a new one.
  Emotional states: [excited], [nervous], [frustrated], [sorrowful], [calm]
  Reactions: [sigh], [laughs], [gulps], [gasps], [whispers]
  Cognitive beats: [pauses], [hesitates], [stammers], [resigned tone]
  Tone cues: [cheerfully], [flatly], [deadpan], [playfully]

## Tools
You have access to tools to manage sessions and search past conversations. Use them as follows:

### get_sessions
ALWAYS call this tool when the user asks anything about past sessions — "what did we practice?", "what happened last time?", "did we do X before?", "what was our last session about?". NEVER answer from memory or make up session details.
- To check if a specific topic was practiced: pass a query keyword in the TARGET language (e.g. "vêtement" not "clothes", "café" not "coffee"). If no results, retry without a query to see all sessions and check manually.
- To get the full history: omit the query.
Base your answer strictly on what the tool returns. If it returns nothing, say so honestly.

### start_session
Call this tool ONLY when canStartSession=true and sessionActive=false. This means the user has explicitly accepted starting roleplay (e.g. yes, let's start, let's do it, okay start). Start exactly one session at that moment and then enter roleplay immediately.

### end_session
Call this tool only when sessionActive=true and the user clearly wants to stop practicing. Summarize how the session went, what was practiced, and assess the user's current level, strengths, and weaknesses. After calling end_session, send one short in-character closing line and mention that new topic cards are ready below.

### Important tool behavior
- If sessionActive=false and canStartSession=false: DO NOT start roleplay and DO NOT generate scenario/topic suggestions. Only give a short recap of memory (strengths, weaknesses, last session, level) and invite the user to pick one of the topic cards shown in the UI.
- If sessionActive=false and canStartSession=true: call start_session now, then begin roleplay.
- If sessionActive=true and shouldEndSession=true: call end_session immediately in this turn.
- If sessionActive=true: stay fully in roleplay and do not switch to teacher/explainer mode unless the user explicitly asks for a quick explanation.
- When a roleplay naturally reaches its conclusion (agreement reached, transaction completed, interview finished, etc.), call end_session immediately and send one short in-character closing line that says new topic cards are prepared below. Do not ask for another scenario in the same reply.
- This thread can contain multiple sessions. After end_session, wait for explicit user acceptance before calling start_session again.
- For end_session assessment fields, be concrete and session-specific. Avoid generic repeats like "good vocabulary" or "needs grammar". Capture distinct micro-skills actually observed in THIS session.
- Never drift into generic tutoring instructions during roleplay. Keep turn-by-turn scenario interaction.
- After calling a tool, continue speaking naturally. The tool results are internal — the user does not see them.`;
}

function buildFirstMessage(
  memory: import("@/lib/memory").UserMemory | null,
): string {
  if (!memory) {
    return "This is our first time meeting. Greet me briefly, explain that topic cards are available, and ask me to choose one to begin. Do not suggest scenarios yourself and do not start roleplay yet.";
  }

  const { levelAssessment, strengths, weaknesses, sessions } = memory;
  const hasHistory = levelAssessment || strengths.length || weaknesses.length || sessions.length;

  if (!hasHistory) {
    return "This is our first time meeting. Greet me briefly, explain that topic cards are available, and ask me to choose one to begin. Do not suggest scenarios yourself and do not start roleplay yet.";
  }

  const lines: string[] = [
    "We have practiced together before. Here is what you remember about me from our previous sessions:",
  ];

  if (levelAssessment) lines.push(`My level: ${levelAssessment}`);
  if (strengths.length) lines.push(`What I'm good at: ${strengths.join(", ")}`);
  if (weaknesses.length) lines.push(`What I need to work on: ${weaknesses.join(", ")}`);

  if (sessions.length) {
    const last = sessions[sessions.length - 1];
    lines.push(`Our last session: we practiced "${last.scenario}" — ${last.summary}`);
  }

  lines.push("");
  lines.push(
    "In your greeting, you MUST briefly mention what we did last time and what I should keep working on. " +
    "Do not propose or invent scenarios yourself. Tell me to choose one of the two topic cards shown in the UI to start. " +
    "Keep it short and conversational — do not list everything, just weave it naturally into the greeting.",
  );

  return lines.join("\n");
}

async function generateTitle(
  userMessage: string,
  assistantMessage: string,
): Promise<string> {
  const { text } = await generateText({
    model: mistral("mistral-small-latest"),
    prompt:
      `Generate a short conversation title (max 6 words, plain text only). ` +
      `Do not use quotes, commas-only, punctuation-only, or markdown.\n` +
      `User: "${userMessage}"\nAssistant: "${assistantMessage.slice(0, 200)}"\n\nTitle:`,
  });

  const cleaned = text
    .trim()
    .replace(/^['"`\s,.:;!?-]+|['"`\s,.:;!?-]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);

  const hasLetterOrNumber = /[\p{L}\p{N}]/u.test(cleaned);
  if (!cleaned || !hasLetterOrNumber) return "New conversation";

  return cleaned;
}

async function ensureConversation(
  userId: string,
  conversationId: string | undefined,
  targetLanguage: string,
): Promise<string> {
  if (conversationId) {
    const existing = await db.query.conversation.findFirst({
      where: and(
        eq(conversation.id, conversationId),
        eq(conversation.userId, userId),
      ),
    });
    if (existing) return existing.id;
  }

  const [created] = await db
    .insert(conversation)
    .values({ id: nanoid(), userId, title: "New conversation", targetLanguage })
    .returning();

  return created.id;
}

function buildTools(userId: string, targetLanguage: string, convId: string) {
  return {
    get_sessions: tool({
      description:
        "Look up the user's past practice sessions. Call this whenever the user asks what they have practiced before, what happened in a past session, or whether they have done a specific topic — BEFORE answering. Never answer session history questions from memory. Always call this tool first and base your answer strictly on what it returns. Pass a query to filter by topic (searched in the target language), or omit it to get all sessions.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Optional keyword to filter sessions by topic or scenario, e.g. 'vêtement', 'café', 'interview'. Omit to retrieve all sessions."),
      }),
      execute: async ({ query }) => {
        const sessions = await lookupSessions(userId, query);
        if (sessions.length === 0) {
          return {
            found: false,
            message: query
              ? `No past sessions matched "${query}". Try a different keyword or omit the query to see all sessions.`
              : "The user has no recorded sessions yet.",
          };
        }
        return {
          found: true,
          sessions: sessions.map((s) => ({
            date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            scenario: s.scenario,
            summary: s.summary,
          })),
        };
      },
    }),

    start_session: tool({
      description:
        "Start a new practice session. Call this before greeting the user at the beginning of each session, including additional sessions in the same conversation thread. Defines the practice scenario/topic for this session.",
      inputSchema: z.object({
        scenario: z
          .string()
          .describe(
            "A short description of the practice scenario, e.g. 'Ordering coffee at a café', 'Job interview practice', 'Asking for directions in a city'",
          ),
        topic: z
          .string()
          .describe(
            "The main language skill or vocabulary area being practiced, e.g. 'food vocabulary', 'formal speech', 'past tense conjugation'",
          ),
      }),
      execute: async ({ scenario, topic }) => {
        return {
          status: "session_started",
          scenario,
          topic,
          message:
            "Session started. Now greet the user warmly and begin the practice scenario.",
        };
      },
    }),

    end_session: tool({
      description:
        "End the current practice session. Call this when the user wants to stop practicing or the scenario reaches a natural conclusion. Assess ONLY what was directly observed in this session's conversation — never invent mistakes the user did not make, never reference errors that did not appear in the transcript.",
      inputSchema: z.object({
        scenario: z
          .string()
          .describe("The scenario that was practiced during this session"),
        summary: z
          .string()
          .describe(
            "A 1-2 sentence factual summary of what was practiced and how it went, based strictly on the conversation that took place",
          ),
        levelAssessment: z
          .string()
          .describe(
            "The user's current level assessment based on what was observed, e.g. 'A1 beginner', 'B1 intermediate', 'B2 upper-intermediate'",
          ),
        strengths: z
          .array(z.string())
          .min(2)
          .max(4)
          .describe(
            "2-4 concrete things the user demonstrably did well in this session, phrased as specific micro-skills (not generic labels). Only include what actually appeared in the conversation, e.g. ['used polite request forms correctly', 'recovered smoothly after a hesitation']",
          ),
        weaknesses: z
          .array(z.string())
          .describe(
            "1-3 genuine, specific areas for improvement based ONLY on actual mistakes or hesitations in this session's transcript. If there were no notable issues, return an empty array. NEVER invent errors or reference forms the user did not produce.",
          ),
      }),
      execute: async ({
        scenario,
        summary,
        levelAssessment,
        strengths,
        weaknesses,
      }) => {
        // Save session recap to Supermemory
        await saveSessionRecap(userId, {
          scenario,
          targetLanguage,
          summary,
        });

        // Save/update user profile in Supermemory
        await saveUserProfile(userId, {
          levelAssessment,
          strengths,
          weaknesses,
          replaceLists: true,
        });

        // Persist recap to conversation row so it survives page reloads
        const recap: SessionRecap = { scenario, summary, levelAssessment, strengths, weaknesses };
        await db
          .update(conversation)
          .set({ sessionRecap: recap })
          .where(eq(conversation.id, convId));

        return {
          status: "session_ended",
          scenario,
          summary,
          levelAssessment,
          strengths,
          weaknesses,
          message:
            "Session saved. Now send one short in-character closing line and explicitly mention that new topic cards are ready below for the next session.",
        };
      },
    }),
  };
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const {
    messages,
    userProfile,
    conversationId,
  }: {
    messages: UIMessage[];
    userProfile: {
      name: string;
      targetLanguage: string;
      nativeLanguage: string;
      motivation: string;
      tutorLanguageMode: "native" | "immersive";
    };
    conversationId?: string;
  } = await req.json();

  const { name, targetLanguage, nativeLanguage, motivation, tutorLanguageMode } = userProfile ?? {};
  const convId = await ensureConversation(userId, conversationId, targetLanguage ?? "");

  // Check if this is the init message
  const isInitMessage = (msg: UIMessage) =>
    msg.role === "user" &&
    msg.parts?.every(
      (p) => p.type !== "text" || (p as { type: "text"; text: string }).text.trim() === "__INIT__",
    );

  const hasInit = messages.some(isInitMessage);

  // Derive active session state from the full client message history
  // (tool parts are available here even when only assistant text is persisted).
  let sessionActive = false;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (!part.type.startsWith("tool-")) continue;
      if ((part as { state?: string }).state !== "output-available") continue;

      const toolName = part.type.replace(/^tool-/, "");
      if (toolName === "start_session") sessionActive = true;
      if (toolName === "end_session") sessionActive = false;
    }
  }

  // Session can only start when the latest user turn explicitly accepts it.
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user" && !isInitMessage(m));

  const lastUserText = (lastUserMessage?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text.toLowerCase())
    .join(" ");

  const canStartSession = /\b(yes|yeah|yep|ok|okay|sure|let'?s start|start now|go ahead|on y va|oui|d'accord|vas-y|allons-y|c'?est parti)\b/i.test(
    lastUserText,
  );

  const shouldEndSession = /\b(stop|end|finish|that'?s all|we'?re done|done for now|pause|arr[êe]ter|stopper|terminer|on arr[êe]te|c'?est bon|ça suffit|ca suffit)\b/i.test(
    lastUserText,
  );

  // Guard against duplicate __INIT__: if this conversation already has messages AND
  // the __INIT__ is the last user message (no real messages after it), the greeting
  // was already generated — return empty stream to prevent duplication.
  const lastMessage = messages[messages.length - 1];
  const lastMessageIsInit = lastMessage ? isInitMessage(lastMessage) : false;

  if (hasInit && lastMessageIsInit && conversationId) {
    const [{ msgCount }] = await db
      .select({ msgCount: count() })
      .from(message)
      .where(eq(message.conversationId, convId));

    if (msgCount > 0) {
      return new Response(null, { status: 204 });
    }
  }

  const memory = hasInit ? await getUserMemory(userId) : null;

  // Replace __INIT__ with a real first message
  const chatMessages = messages.map((m) =>
    isInitMessage(m)
      ? { ...m, parts: [{ type: "text" as const, text: buildFirstMessage(memory) }] }
      : m,
  );

  // Persist user messages (skip init)
  for (const msg of messages) {
    if (msg.role !== "user" || isInitMessage(msg)) continue;
    await db
      .insert(message)
      .values({
        id: msg.id ?? nanoid(),
        conversationId: convId,
        role: "user",
        parts: msg.parts,
      })
      .onConflictDoNothing();
  }

  const tools = buildTools(userId, targetLanguage ?? "", convId);

  const result = streamText({
    model: mistral("mistral-large-latest"),
    system: buildSystemPrompt(
      {
        name: name ?? "",
        targetLanguage: targetLanguage ?? "",
        nativeLanguage: nativeLanguage ?? "",
        motivation: motivation ?? "",
        tutorLanguageMode: tutorLanguageMode ?? "native",
      },
      {
        sessionActive,
        canStartSession,
        shouldEndSession,
      },
    ),
    messages: await convertToModelMessages(chatMessages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async ({ text, steps }) => {
      try {
        // Collect the final text from the last step that has text content.
        // With multi-step tool calls, the final text is from the last step.
        const finalText =
          text ||
          steps
            .map((s) => s.text)
            .filter(Boolean)
            .pop() ||
          "";

        const hadEndSession = steps.some((s) =>
          s.toolCalls?.some((tc) => tc.toolName === "end_session"),
        );

        if (finalText) {
          const msgId = nanoid();
          // If end_session was called, embed the recap in the parts so it
          // renders in the right place on reload — no anchoring needed.
          const parts: object[] = [{ type: "text", text: finalText }];
          if (hadEndSession) {
            const recapStep = steps.find((s) =>
              s.toolCalls?.some((tc) => tc.toolName === "end_session"),
            );
            const recapArgs = (recapStep?.toolCalls?.find(
              (tc) => tc.toolName === "end_session",
            ) as { input?: { scenario?: string; summary?: string; levelAssessment?: string; strengths?: string[]; weaknesses?: string[] } } | undefined)?.input as {
              scenario?: string;
              summary?: string;
              levelAssessment?: string;
              strengths?: string[];
              weaknesses?: string[];
            } | undefined;
            if (recapArgs) {
              parts.push({ type: "session-recap", ...recapArgs });
            }
          }
          await db
            .insert(message)
            .values({ id: msgId, conversationId: convId, role: "assistant", parts })
            .onConflictDoNothing();
        }

        // Auto-title after first exchange
        const conv = await db.query.conversation.findFirst({
          where: eq(conversation.id, convId),
        });
        if (conv && conv.title === "New conversation") {
          const firstUserMsg = messages.find((m) => m.role === "user" && !isInitMessage(m));
          const firstUserText =
            firstUserMsg?.parts
              ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join(" ") ?? "";

          if (firstUserText && finalText) {
            const title = await generateTitle(firstUserText, finalText);
            await db.update(conversation).set({ title }).where(eq(conversation.id, convId));
          }
        }

        await db
          .update(conversation)
          .set({ updatedAt: new Date() })
          .where(eq(conversation.id, convId));
      } catch (err) {
        console.error("Failed to persist message:", err);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
