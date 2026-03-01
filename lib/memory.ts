import Supermemory from "supermemory";

let _client: Supermemory | null = null;

function getClient(): Supermemory | null {
  if (!process.env.SUPERMEMORY_API_KEY) return null;
  if (!_client) _client = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY });
  return _client;
}

// Fixed document IDs — one profile doc + one session history doc per user.
const profileDocId = (userId: string) => `profile-${userId}`;
const sessionsDocId = (userId: string) => `sessions-${userId}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionEntry = {
  date: string;       // ISO 8601 full timestamp, e.g. 2026-02-28T14:32:00Z
  scenario: string;
  summary: string;
};

export type UserMemory = {
  levelAssessment: string | null;
  strengths: string[];
  weaknesses: string[];
  sessions: SessionEntry[];
};

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseProfileContent(content: string): Pick<UserMemory, "levelAssessment" | "strengths" | "weaknesses"> {
  const get = (key: string) => content.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1]?.trim() ?? null;
  const splitList = (val: string | null) => val ? val.split("|").map((s) => s.trim()).filter(Boolean) : [];
  return {
    levelAssessment: get("Level"),
    strengths: splitList(get("Strengths")),
    weaknesses: splitList(get("Weaknesses")),
  };
}

function parseSessionsContent(content: string): SessionEntry[] {
  return content
    .split("\n")
    .filter((line) => line.includes(" | "))
    .map((line) => {
      const [date, scenario, ...rest] = line.split(" | ");
      return { date: date.trim(), scenario: scenario.trim(), summary: rest.join(" | ").trim() };
    })
    .filter((s) => s.date && s.scenario && s.summary);
}

function serializeProfileContent(data: Pick<UserMemory, "levelAssessment" | "strengths" | "weaknesses">): string {
  const lines: string[] = [];
  if (data.levelAssessment?.trim()) lines.push(`Level: ${data.levelAssessment.trim()}`);
  if (data.strengths.length > 0)    lines.push(`Strengths: ${data.strengths.join(" | ")}`);
  if (data.weaknesses.length > 0)   lines.push(`Weaknesses: ${data.weaknesses.join(" | ")}`);
  return lines.join("\n");
}

function serializeSessionsContent(sessions: SessionEntry[]): string {
  return sessions.map((s) => `${s.date} | ${s.scenario} | ${s.summary}`).join("\n");
}

// ─── Read ─────────────────────────────────────────────────────────────────────

async function fetchDocContent(client: Supermemory, docId: string): Promise<string | null> {
  try {
    const doc = await client.documents.get(docId);
    return (doc.content ?? doc.raw as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function getUserMemory(userId: string): Promise<UserMemory | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const [profileContent, sessionsContent] = await Promise.race([
      Promise.all([
        fetchDocContent(client, profileDocId(userId)),
        fetchDocContent(client, sessionsDocId(userId)),
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);

    return {
      ...(profileContent ? parseProfileContent(profileContent) : { levelAssessment: null, strengths: [], weaknesses: [] }),
      sessions: sessionsContent ? parseSessionsContent(sessionsContent).slice(-5) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Look up the user's full session history (all up to 20 stored), newest first.
 * If query is provided, filters to sessions whose scenario or summary contains it.
 * Always reads the raw unsliced doc — not capped at 5 like getUserMemory.
 */
export async function lookupSessions(
  userId: string,
  query?: string,
): Promise<SessionEntry[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const content = await Promise.race([
      fetchDocContent(client, sessionsDocId(userId)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    if (!content) return [];

    const all = parseSessionsContent(content).reverse(); // newest first
    if (!query) return all;

    const lower = query.toLowerCase();
    return all.filter(
      (s) =>
        s.scenario.toLowerCase().includes(lower) ||
        s.summary.toLowerCase().includes(lower),
    );
  } catch {
    return [];
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Merge new session assessment into the learner's core profile.
 * - levelAssessment: always replaced with the latest
 * - strengths / weaknesses: merged with existing, deduped, capped at 10 each
 */
export async function saveUserProfile(
  userId: string,
  data: { levelAssessment?: string | null; strengths?: string[]; weaknesses?: string[] },
): Promise<void> {
  const client = getClient();
  if (!client) return;

  // Read existing profile to merge into
  const existing = await fetchDocContent(client, profileDocId(userId));
  const prev = existing
    ? parseProfileContent(existing)
    : { levelAssessment: null, strengths: [], weaknesses: [] };

  const dedup = (a: string[], b: string[]) => {
    const seen = new Set(a.map((s) => s.toLowerCase()));
    return [...a, ...b.filter((s) => !seen.has(s.toLowerCase()))];
  };

  const merged = {
    levelAssessment: data.levelAssessment ?? prev.levelAssessment,
    strengths: dedup(data.strengths ?? [], prev.strengths).slice(0, 10),
    weaknesses: dedup(data.weaknesses ?? [], prev.weaknesses).slice(0, 10),
  };

  const content = serializeProfileContent(merged);
  if (!content) return;

  try {
    await client.documents.add({
      content,
      containerTag: userId,
      customId: profileDocId(userId),
      metadata: { type: "user_core_profile" },
    });
  } catch { /* non-critical */ }
}

/**
 * Append a completed session to the session history document and rewrite it in place.
 * Keeps the last 20 sessions. Always overwrites via fixed customId.
 */
export async function saveSessionRecap(
  userId: string,
  recap: { scenario: string; targetLanguage: string; summary: string },
): Promise<void> {
  const client = getClient();
  if (!client) return;

  // Read the existing sessions first so we can append
  const existing = await fetchDocContent(client, sessionsDocId(userId));
  const sessions = existing ? parseSessionsContent(existing) : [];

  const date = new Date().toISOString(); // full timestamp so multiple sessions per day are ordered correctly
  const updated = [...sessions, { date, scenario: recap.scenario, summary: recap.summary }].slice(-20);

  try {
    await client.documents.add({
      content: serializeSessionsContent(updated),
      containerTag: userId,
      customId: sessionsDocId(userId),
      metadata: { type: "session_history", language: recap.targetLanguage },
    });
  } catch { /* non-critical */ }
}
