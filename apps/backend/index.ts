import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, SERVICES, type ServiceKey } from "./knowledge.ts";
import { checkAvailability, createBooking, isCalendarConfigured } from "./calendar.ts";

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", calendarConfigured: isCalendarConfigured() });
});

type ChatMessage = { role: "user" | "assistant"; content: string };

// Module 4: the tools the model can call. Giving Claude "tools" here doesn't
// mean Claude runs any code itself — it means Claude can ask US to run a
// function and tell it the result. The loop below is: ask Claude what to do
// -> if it asked for a tool, run that function ourselves -> hand the result
// back -> ask again -> repeat until Claude has enough to just reply in text.
const tools: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Check whether a date/time is free for a service, given business hours and existing bookings. ALWAYS call this before book_appointment — never assume a slot is open. If the slot is not available, the result includes a list of alternative open slots to offer instead.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "24-hour time in HH:MM format, e.g. '15:00' for 3pm" },
        service: {
          type: "string",
          enum: Object.keys(SERVICES),
          description: "Which service is being booked",
        },
      },
      required: ["date", "time", "service"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Create the actual calendar booking. Only call this after check_availability has confirmed the slot is available, and after the customer has given their name and email.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer's name" },
        email: { type: "string", description: "Customer's email address, for the calendar invite" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "24-hour time in HH:MM format" },
        service: { type: "string", enum: Object.keys(SERVICES) },
      },
      required: ["name", "email", "date", "time", "service"],
    },
  },
];

async function runTool(name: string, input: any): Promise<unknown> {
  if (!isCalendarConfigured()) {
    return { error: "Google Calendar isn't connected yet — booking is temporarily unavailable." };
  }

  if (name === "check_availability") {
    return checkAvailability(input.date, input.time, input.service as ServiceKey);
  }

  if (name === "book_appointment") {
    // Defensive re-check: shrinks (doesn't eliminate) the race window
    // between "I checked" and "I booked" if two customers chat at once.
    const availability = await checkAvailability(input.date, input.time, input.service as ServiceKey);
    if (!availability.available) {
      return { error: "That slot was taken in the last moment — please pick another.", ...availability };
    }
    const booking = await createBooking({
      name: input.name,
      email: input.email,
      date: input.date,
      time: input.time,
      service: input.service as ServiceKey,
    });
    return { success: true, ...booking };
  }

  return { error: `Unknown tool: ${name}` };
}

const MAX_TOOL_TURNS = 5;

app.post("/api/v1/chat", async (req, res) => {
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!messages || !messages.length) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  try {
    const conversation: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
    let reply = "Sorry, I'm having trouble with that right now — please try again.";

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools,
        messages: conversation,
      });

      const toolUses = completion.content.filter((block) => block.type === "tool_use");

      if (toolUses.length === 0) {
        const textBlock = completion.content.find((block) => block.type === "text");
        reply = textBlock?.type === "text" ? textBlock.text : "(no reply)";
        break;
      }

      // Claude's turn (including the tool_use blocks) has to go back into
      // the conversation before we can send tool_result blocks for it.
      conversation.push({ role: "assistant", content: completion.content });

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          const result = await runTool(toolUse.name, toolUse.input);
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        })
      );

      conversation.push({ role: "user", content: toolResults });
    }

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
