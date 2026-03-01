# SpokeAI - Hackathon Setup Guide

A voice-first AI language tutor built with Next.js, Mistral AI, and ElevenLabs. Practice speaking any language through immersive roleplay scenarios with personalized feedback and long-term memory.

## Features

- **Voice-First Interface**: Talk naturally with AI via speech-to-text (Voxtral) and text-to-speech (ElevenLabs)
- **Immersive Roleplay**: Practice real-world scenarios (ordering food, job interviews, asking directions)
- **AI-Powered Memory**: Long-term learner profile with strengths, weaknesses, and session history via Supermemory
- **Smart Session Management**: AI automatically starts/ends practice sessions and generates personalized recaps
- **Topic Suggestions**: AI-generated practice scenarios based on your learning goals
- **Multi-Language Support**: Practice any language with bilingual tutor support

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **AI SDK**: Vercel AI SDK with Mistral Large
- **Speech**: Voxtral (STT) + ElevenLabs (TTS)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better Auth with GitHub OAuth
- **Memory**: Supermemory API
- **Styling**: Tailwind CSS + shadcn/ui

## Prerequisites

- Node.js 20+ or Bun
- PostgreSQL database (local or cloud)
- API keys for:
  - [Mistral AI](https://console.mistral.ai/)
  - [ElevenLabs](https://elevenlabs.io/)
  - [Supermemory](https://supermemory.ai/)
  - [GitHub OAuth](https://github.com/settings/developers)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd mistral-hackathon
bun install  # or npm install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env.local
```

Fill in your API keys in `.env.local`:

```env
# Mistral AI for chat and Voxtral STT
MISTRAL_API_KEY=your_mistral_api_key

# ElevenLabs for text-to-speech
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# PostgreSQL database
DATABASE_URL=postgresql://user:password@localhost:5432/spokeai

# Better Auth secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your_random_32_char_secret

# Your app URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

SUPERMEMORY_API_KEY=your_supermemory_api_key
```

### 3. Database Setup

Make sure PostgreSQL is running, then push the schema:

```bash
bunx drizzle-kit push
```

### 4. Run Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Session Flow

1. **New Conversation**: User starts a chat → AI greets them with memory of past sessions
2. **Topic Selection**: AI suggests 2 practice scenarios as clickable cards
3. **Session Start**: User accepts → AI calls `start_session` tool → enters roleplay
4. **Roleplay**: AI stays in character, speaks in target language, user practices speaking
5. **Session End**: User says "stop" or scenario ends → AI calls `end_session` tool
6. **Recap**: AI generates assessment (level, strengths, weaknesses) → saves to memory

### AI Tools

The AI has 3 tools available via `streamText`:

| Tool | Purpose | When Called |
|------|---------|-------------|
| `get_sessions` | Lookup past practice history | User asks "what did we practice?" |
| `start_session` | Begin a roleplay scenario | User accepts to start practicing |
| `end_session` | End session and save recap | User says stop or scenario ends |

### Memory Architecture

```
Short-term (PostgreSQL)
├── Conversations + Messages
└── Session recaps per conversation

Long-term (Supermemory)
├── User profile: level, strengths, weaknesses
└── Session history: last 20 scenarios
```

## API Keys Reference

| Service | Get Key At | Used For |
|---------|-----------|----------|
| Mistral AI | [console.mistral.ai](https://console.mistral.ai/) | Chat LLM + Voxtral STT |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io/) | Text-to-speech |
| Supermemory | [supermemory.ai](https://supermemory.ai/) | Long-term user memory |
| GitHub OAuth | [github.com/settings/developers](https://github.com/settings/developers) | User authentication |

## License

MIT - Built for Mistral AI Hackathon 2026
