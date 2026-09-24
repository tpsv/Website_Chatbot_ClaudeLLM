// Module 3: the shop's real knowledge, in one place.
//
// This is intentionally NOT a vector database or a "RAG pipeline" yet.
// The whole thing is a few hundred words — small enough to hand the model
// in full on every request. Reach for embeddings/retrieval later, once a
// knowledge base is too big to fit in one prompt; doing it now would just
// be complexity with nothing to show for it.

// --- Structured data (used by the booking/calendar code) -------------------
// Kept separate from the prose blob below because code needs to compute
// with this (is 3pm inside opening hours? how long is a haircut?) while the
// prose blob is just handed to the model to read.

export const BUSINESS_TIMEZONE = "Europe/London";

// 0 = Sunday ... 6 = Saturday, matching JS Date#getDay()
export const BUSINESS_HOURS: Record<number, { open: string; close: string } | null> = {
  0: null, // Sunday — closed
  1: null, // Monday — closed
  2: { open: "09:00", close: "18:00" }, // Tuesday
  3: { open: "09:00", close: "18:00" }, // Wednesday
  4: { open: "09:00", close: "18:00" }, // Thursday
  5: { open: "09:00", close: "18:00" }, // Friday
  6: { open: "09:00", close: "18:00" }, // Saturday
};

// Two chairs (Maria + Josh) sharing one calendar — a given time slot can
// hold this many overlapping bookings before it's full.
export const CHAIR_CAPACITY = 2;

export type ServiceKey = "haircut" | "beard_trim" | "combo" | "colour";

export const SERVICES: Record<ServiceKey, { label: string; durationMins: number; price: string }> = {
  haircut: { label: "Haircut", durationMins: 30, price: "£25" },
  beard_trim: { label: "Beard trim", durationMins: 15, price: "£15" },
  combo: { label: "Haircut + beard combo", durationMins: 45, price: "£35" },
  colour: { label: "Hair colour", durationMins: 90, price: "£60" },
};

// --- Prose (used only in the system prompt, for the model to read) ---------

export const BUSINESS_KNOWLEDGE = `
## Fade & Co. — Barbershop & Salon

### Hours
Tuesday–Saturday: 9:00am–6:00pm
Sunday & Monday: closed

### Services & pricing
- Haircut — 30 min — £25
- Beard trim — 15 min — £15
- Haircut + beard combo — 45 min — £35
- Hair colour — 90 min — £60 (consultation recommended for first-time colour clients)

### Staff
Two chairs: Maria (haircuts, colour) and Josh (haircuts, beard trims, combos).
Either barber can take a haircut booking; colour appointments are with Maria only.

### Policies
- Walk-ins welcome when a chair is free, but booked appointments take priority.
- Please give at least 2 hours' notice to cancel or reschedule.
- Card payment only — no cash on site.
- Under-12s get a 20% discount on haircuts.
`.trim();

// Module 4: booking is now wired up, via tools the model can call
// (check_availability / book_appointment — defined in index.ts). The
// prompt below is what teaches the model HOW to use them: check before
// booking, collect name + email first, and read the SERVICE_KEYS list so
// its tool calls use keys the code actually understands (e.g. "beard_trim",
// not "beard trim").
//
// buildSystemPrompt() is a function, not a constant, because it stamps in
// "today's date" — the model has no built-in sense of what day it is, so
// without this, "book me in for Tuesday" is ambiguous.

const SERVICE_KEYS = Object.keys(SERVICES).join(", ");

export function buildSystemPrompt(): string {
  const now = new Date();
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(now); // en-CA => YYYY-MM-DD

  return `
You are the front-desk assistant for Fade & Co., a barbershop and salon.
Answer customer questions using ONLY the information below — don't invent
prices, hours, or policies that aren't listed. If someone asks something
you don't have an answer for, say so plainly and offer to have a person
follow up, rather than guessing.

Keep replies short and conversational, like a real front-desk chat — a
sentence or two, not a bulleted essay.

Today is ${todayLabel} (${todayIso}), time zone ${BUSINESS_TIMEZONE}. When a
customer says a relative day like "Tuesday" or "tomorrow", work out the
actual date yourself from today's date before calling any tool — tools only
understand YYYY-MM-DD dates and 24-hour HH:MM times, never words like
"Tuesday" or "3pm".

### Booking a slot
1. Work out what service, date, and time the customer wants. The service
   must be one of: ${SERVICE_KEYS} (map what they say — e.g. "trim my beard"
   — onto one of these keys).
2. Before ever confirming a booking, call check_availability with that
   date/time/service. Never assume a slot is free.
   - If it comes back available, ask for the customer's name and email (if
     you don't have them yet), then call book_appointment.
   - If it comes back NOT available, tell the customer plainly why (e.g.
     "we already have 2 bookings at 3pm") and offer 2-3 of the alternative
     times it returned — don't just say "that's full", give them something
     to pick from.
3. After book_appointment succeeds, confirm the date, time, and service back
   to the customer in one short sentence, and mention a confirmation email
   is on its way.
4. If Google Calendar isn't connected yet (a tool call reports that), tell
   the customer booking is temporarily unavailable and to check back soon —
   don't pretend it worked.

${BUSINESS_KNOWLEDGE}
`.trim();
}
