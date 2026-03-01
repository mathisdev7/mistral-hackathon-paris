"use server";

import { generateObject, generateText } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getUserMemory } from "@/lib/memory";

export type TopicCard = {
  title: string;
  subtitle: string;
};

export type TopicSource = "ai" | "fallback";

export type LatestSessionRecap = {
  scenario?: string;
  summary?: string;
  levelAssessment?: string;
  strengths: string[];
  weaknesses: string[];
  date?: string;
};

const topicSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().min(1),
        subtitle: z.string().min(1),
      }),
    )
    .length(2),
});

function normalizeScenario(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePreviouslyDoneTopics(topics: TopicCard[], previousScenarios: string[]): TopicCard[] {
  const done = previousScenarios.map(normalizeScenario).filter(Boolean);
  const unique: TopicCard[] = [];
  const seen = new Set<string>();

  for (const topic of topics) {
    const key = normalizeScenario(topic.title);
    if (!key || seen.has(key)) continue;

    const alreadyDone = done.some((past) => key.includes(past) || past.includes(key));
    if (alreadyDone) continue;

    seen.add(key);
    unique.push(topic);
  }

  return unique;
}

function fallbackTopics(targetLanguage: string, previousScenarios: string[]): TopicCard[] {
  const frenchPool: TopicCard[] = [
    { title: "Réserver chez le médecin", subtitle: "Prendre rendez-vous et préciser tes besoins" },
    { title: "Retourner un achat", subtitle: "Expliquer le problème et demander un échange" },
    { title: "Appeler le propriétaire", subtitle: "Signaler un souci dans l'appartement" },
    { title: "Parler à un collègue", subtitle: "Demander de l'aide sur une tâche" },
    { title: "Acheter des billets", subtitle: "Choisir horaires et tarifs au guichet" },
    { title: "Planifier un week-end", subtitle: "Proposer activités et confirmer un programme" },
  ];

  const defaultPool: TopicCard[] = [
    { title: "Doctor appointment", subtitle: "Book and explain your symptoms clearly" },
    { title: "Return an item", subtitle: "Explain issue and request refund" },
    { title: "Call your landlord", subtitle: "Report a home problem politely" },
    { title: "Ask colleague help", subtitle: "Request support on a work task" },
    { title: "Buy train tickets", subtitle: "Choose times and ask prices" },
    { title: "Plan a weekend", subtitle: "Suggest activities and confirm plans" },
  ];

  const pool = (targetLanguage || "").toLowerCase() === "french" ? frenchPool : defaultPool;
  const filtered = removePreviouslyDoneTopics(pool, previousScenarios).slice(0, 2);

  if (filtered.length === 2) return filtered;

  const lang = (targetLanguage || "").toLowerCase() === "french" ? "fr" : "en";
  if (lang === "fr") {
    return [
      ...filtered,
      { title: "Nouveau scénario 1", subtitle: "Gérer une situation du quotidien" },
      { title: "Nouveau scénario 2", subtitle: "Réagir et poser des questions" },
    ].slice(0, 2);
  }

  return [
    ...filtered,
    { title: "New scenario one", subtitle: "Handle a practical daily situation" },
    { title: "New scenario two", subtitle: "React naturally and ask questions" },
  ].slice(0, 2);
}

function parseTopicArray(raw: string): TopicCard[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    const topics = parsed
      .filter((item): item is { title?: unknown; subtitle?: unknown } => !!item && typeof item === "object")
      .map((item) => ({
        title: typeof item.title === "string" ? item.title.trim() : "",
        subtitle: typeof item.subtitle === "string" ? item.subtitle.trim() : "",
      }))
      .filter((item) => item.title.length > 0 && item.subtitle.length > 0);

    return topics.length ? topics : null;
  } catch {
    return null;
  }
}

async function generateTopicsWithAi(
  targetLanguage: string,
  motivation: string,
  weaknesses: string,
  previousScenarios: string[],
): Promise<TopicCard[] | null> {
  const priorList = previousScenarios.length ? previousScenarios.slice(-12).join(", ") : "none";

  const basePrompt =
    `Create exactly 2 NEW roleplay starter topic cards for a ${targetLanguage || "language"} learner. ` +
    `Motivation: ${motivation || "general conversation"}. ` +
    `Weak areas: ${weaknesses || "none provided"}. ` +
    `Previously done scenarios (MUST avoid): ${priorList}. ` +
    "Each title max 5 words. Each subtitle max 10 words. Practical speaking scenarios only.";

  try {
    const { object } = await generateObject({
      model: mistral("mistral-large-latest"),
      schema: topicSchema,
      prompt: basePrompt,
    });

    const topics = removePreviouslyDoneTopics(
      object.topics.map((topic) => ({
        title: topic.title.trim(),
        subtitle: topic.subtitle.trim(),
      })),
      previousScenarios,
    );

    if (topics.length >= 2) return topics.slice(0, 2);
  } catch {
    // fall through
  }

  try {
    const { text } = await generateText({
      model: mistral("mistral-large-latest"),
      prompt:
        `${basePrompt} ` +
        `Return ONLY JSON array of 2 objects with keys title and subtitle. No markdown, no prose.`,
    });

    const parsed = parseTopicArray(text);
    const filtered = parsed ? removePreviouslyDoneTopics(parsed, previousScenarios) : [];
    if (filtered.length >= 2) return filtered.slice(0, 2);

    const { text: repaired } = await generateText({
      model: mistral("mistral-large-latest"),
      prompt:
        "Rewrite this into valid JSON array of exactly 2 objects with keys title and subtitle. JSON only:\n" +
        text,
    });

    const repairedParsed = parseTopicArray(repaired);
    const repairedFiltered = repairedParsed ? removePreviouslyDoneTopics(repairedParsed, previousScenarios) : [];
    if (repairedFiltered.length >= 2) return repairedFiltered.slice(0, 2);
  } catch {
    // fall through
  }

  return null;
}

export async function generateSessionTopicsAction(input: {
  targetLanguage: string;
  motivation: string;
}): Promise<{ topics: TopicCard[]; source: TopicSource }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { topics: fallbackTopics(input.targetLanguage, []), source: "fallback" };
  }

  const memory = await getUserMemory(session.user.id);
  const weaknesses = memory?.weaknesses?.slice(0, 4).join(", ") ?? "";
  const previousScenarios = memory?.sessions?.map((s) => s.scenario) ?? [];

  const aiTopics = await generateTopicsWithAi(
    input.targetLanguage,
    input.motivation,
    weaknesses,
    previousScenarios,
  );

  if (aiTopics) return { topics: aiTopics, source: "ai" };

  return {
    topics: fallbackTopics(input.targetLanguage, previousScenarios),
    source: "fallback",
  };
}

export async function getLatestSessionRecapAction(): Promise<LatestSessionRecap | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const memory = await getUserMemory(session.user.id);
  if (!memory || memory.sessions.length === 0) return null;

  const latest = [...memory.sessions].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!latest) return null;

  return {
    scenario: latest.scenario,
    summary: latest.summary,
    levelAssessment: memory.levelAssessment ?? undefined,
    strengths: memory.strengths.slice(0, 3),
    weaknesses: memory.weaknesses.slice(0, 3),
    date: latest.date,
  };
}
