# Website Chatbot (Claude LLM)

An AI-powered website chatbot that handles customer enquiries and books appointments directly into Google Calendar. Built for **Fade & Co.**, a fictional barbershop/salon, as a demo of an LLM-driven booking assistant.

## Tech Stack

- **Frontend:** React
- **Backend:** Express (Node.js)
- **LLM:** Claude API (Anthropic)
- **Booking:** Google Calendar API (OAuth2)
- **Monorepo tooling:** Turborepo
- **Package manager / runtime:** Bun

## Prerequisites

- [Bun](https://bun.sh) installed on your machine
- A Google Cloud project with the Calendar API enabled, and OAuth2 credentials
- An Anthropic API key

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/Website_Chatbot_ClaudeLLM.git
cd Website_Chatbot_ClaudeLLM
```

### 2. Install Bun

**macOS / Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows (PowerShell):**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify the install:
```bash
bun --version
```

### 3. Install dependencies

From the project root:
```bash
bun install
```

### 4. Configure environment variables

Copy the example env file in the backend and fill in your own values:
```bash
cp apps/backend/.env.example apps/backend/.env
```

You'll need:
```
ANTHROPIC_API_KEY=

# Google Calendar (OAuth2) — see scripts/get-refresh-token.ts
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=primary
```

> **Never commit your `.env` file.** Make sure it's listed in `.gitignore`.

### 5. Run the app

```bash
bun run dev
```

This starts both the frontend and backend in development mode via Turborepo.

## Project Structure

```
apps/
  backend/    # Express server, Claude API integration, Google Calendar booking logic
  frontend/   # React chat widget / website UI
```


