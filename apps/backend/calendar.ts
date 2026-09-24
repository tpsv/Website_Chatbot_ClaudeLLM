// Module 4: Google Calendar as the single source of truth for bookings.
//
// There's no separate database here — the calendar itself IS the booking
// store. To find out if a slot is free, we ask Google what events already
// exist in that window. To make a booking, we insert an event. That keeps
// this simple and means Sam can literally open Google Calendar and see
// exactly what the bot has booked.

import { OAuth2Client } from "google-auth-library";
import { BUSINESS_HOURS, BUSINESS_TIMEZONE, CHAIR_CAPACITY, SERVICES, type ServiceKey } from "./knowledge.ts";
import { addDays, dayOfWeekInZone, toLocalTimeString, zonedTimeToUtc } from "./timezone.ts";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const SLOT_STEP_MINS = 15; // granularity used when scanning for alternative open slots

export function isCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

let oauth2Client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!isCalendarConfigured()) {
    throw new Error(
      "Google Calendar isn't configured yet — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are missing from .env."
    );
  }
  if (!oauth2Client) {
    oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return oauth2Client;
}

// Talks to the Calendar REST API directly over fetch, rather than pulling in
// the full `googleapis` SDK — that package bundles literally every Google
// API and is enormous; we only need three endpoints, so google-auth-library
// (for the access token) plus fetch is all this needs.
async function calendarFetch(path: string, init: RequestInit = {}) {
  const client = getClient();
  const { token } = await client.getAccessToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar API ${res.status}: ${body}`);
  }
  return res.json();
}

type CalEvent = { start: { dateTime?: string }; end: { dateTime?: string } };

async function listEventsForDay(dateStr: string): Promise<CalEvent[]> {
  const dayStartUtc = zonedTimeToUtc(dateStr, "00:00", BUSINESS_TIMEZONE);
  const dayEndUtc = zonedTimeToUtc(dateStr, "23:59", BUSINESS_TIMEZONE);
  const params = new URLSearchParams({
    timeMin: dayStartUtc.toISOString(),
    timeMax: dayEndUtc.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const data = await calendarFetch(`/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`);
  return data.items ?? [];
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function countOverlapping(events: CalEvent[], start: Date, end: Date): number {
  return events.filter((e) => {
    if (!e.start.dateTime || !e.end.dateTime) return false; // skip all-day events
    return overlaps(start, end, new Date(e.start.dateTime), new Date(e.end.dateTime));
  }).length;
}

export type AvailabilityResult = {
  requested: { date: string; time: string; service: ServiceKey; durationMins: number };
  withinBusinessHours: boolean;
  available: boolean;
  bookedCount: number;
  capacity: number;
  alternatives: { date: string; time: string }[];
};

export async function checkAvailability(date: string, time: string, service: ServiceKey): Promise<AvailabilityResult> {
  const { durationMins } = SERVICES[service];
  const requested = { date, time, service, durationMins };
  const dow = dayOfWeekInZone(date, BUSINESS_TIMEZONE);
  const hours = BUSINESS_HOURS[dow];

  if (!hours) {
    return {
      requested,
      withinBusinessHours: false,
      available: false,
      bookedCount: 0,
      capacity: CHAIR_CAPACITY,
      alternatives: await findAlternatives(date, durationMins, 3),
    };
  }

  const slotStart = zonedTimeToUtc(date, time, BUSINESS_TIMEZONE);
  const slotEnd = new Date(slotStart.getTime() + durationMins * 60_000);
  const openStart = zonedTimeToUtc(date, hours.open, BUSINESS_TIMEZONE);
  const openEnd = zonedTimeToUtc(date, hours.close, BUSINESS_TIMEZONE);
  const withinBusinessHours = slotStart >= openStart && slotEnd <= openEnd;

  const events = await listEventsForDay(date);
  const bookedCount = countOverlapping(events, slotStart, slotEnd);
  const available = withinBusinessHours && bookedCount < CHAIR_CAPACITY;

  return {
    requested,
    withinBusinessHours,
    available,
    bookedCount,
    capacity: CHAIR_CAPACITY,
    alternatives: available ? [] : await findAlternatives(date, durationMins, 3, events),
  };
}

async function findAlternatives(
  date: string,
  durationMins: number,
  count: number,
  eventsForFirstDay?: CalEvent[]
): Promise<{ date: string; time: string }[]> {
  const results: { date: string; time: string }[] = [];

  for (let dayOffset = 0; dayOffset < 7 && results.length < count; dayOffset++) {
    const d = addDays(date, dayOffset);
    const hours = BUSINESS_HOURS[dayOfWeekInZone(d, BUSINESS_TIMEZONE)];
    if (!hours) continue;

    const events = dayOffset === 0 && eventsForFirstDay ? eventsForFirstDay : await listEventsForDay(d);
    const openStart = zonedTimeToUtc(d, hours.open, BUSINESS_TIMEZONE);
    const openEnd = zonedTimeToUtc(d, hours.close, BUSINESS_TIMEZONE);

    for (
      let slotStart = openStart;
      slotStart.getTime() + durationMins * 60_000 <= openEnd.getTime() && results.length < count;
      slotStart = new Date(slotStart.getTime() + SLOT_STEP_MINS * 60_000)
    ) {
      const slotEnd = new Date(slotStart.getTime() + durationMins * 60_000);
      if (countOverlapping(events, slotStart, slotEnd) < CHAIR_CAPACITY) {
        results.push({ date: d, time: toLocalTimeString(slotStart, BUSINESS_TIMEZONE) });
      }
    }
  }

  return results;
}

export async function createBooking(params: {
  name: string;
  email: string;
  date: string;
  time: string;
  service: ServiceKey;
}): Promise<{ eventId: string; htmlLink: string }> {
  const { name, email, date, time, service } = params;
  const { label, durationMins } = SERVICES[service];

  const start = zonedTimeToUtc(date, time, BUSINESS_TIMEZONE);
  const end = new Date(start.getTime() + durationMins * 60_000);

  const body = {
    summary: `${label} — ${name}`,
    description: `Booked via the Fade & Co. website assistant.\nService: ${label}\nCustomer: ${name} (${email})`,
    start: { dateTime: start.toISOString(), timeZone: BUSINESS_TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: BUSINESS_TIMEZONE },
    attendees: [{ email, displayName: name }],
  };

  const query = new URLSearchParams({ sendUpdates: "all" }); // emails the customer an invite
  const data = await calendarFetch(`/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${query}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return { eventId: data.id, htmlLink: data.htmlLink };
}
