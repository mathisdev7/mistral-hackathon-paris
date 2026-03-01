import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      targetLanguage:     { type: "string", required: false, defaultValue: "" },
      nativeLanguage:     { type: "string", required: false, defaultValue: "" },
      motivation:         { type: "string", required: false, defaultValue: "" },
      tutorLanguageMode:  { type: "string", required: false, defaultValue: "native" },
      voiceGender:        { type: "string", required: false, defaultValue: "female" },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
