import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./knowledge.ts";

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

type ChatMessage = { role: "user" | "assistant"; content: string };

app.post("/api/v1/chat", async (req, res) => {
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!messages || !messages.length) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  try {
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply =
      completion.content[0]?.type === "text"
        ? completion.content[0].text
        : "(no reply)";
    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Something went wrong talking to the assistant." });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});