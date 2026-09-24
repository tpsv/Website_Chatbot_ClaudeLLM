// One-time setup script — run this ONCE from your own machine to link your
// Google account to the assistant. It does NOT run as part of the backend
// server; it just prints a refresh token for you to paste into .env.
//
// Usage:
//   1. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are already set
//      in apps/backend/.env (from the Google Cloud Console — see README).
//   2. From apps/backend, run:  node --env-file=.env scripts/get-refresh-token.ts
//   3. A URL is printed — open it in your browser, sign in with the Google
//      account whose calendar should hold bookings, and approve access.
//   4. Google redirects your browser to localhost — the script catches that
//      automatically and prints a GOOGLE_REFRESH_TOKEN line.
//   5. Paste that line into apps/backend/.env, replacing the empty one.
//
// Why this exists: an OAuth "refresh token" is a long-lived credential that
// lets the backend keep getting fresh short-lived access tokens on its own,
// forever, without you ever having to log in again. This script's only job
// is to perform that one-time browser login and hand back that token.

import { createServer } from "node:http";
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3939;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.\n" +
      "Set them in apps/backend/.env first (from the Google Cloud Console OAuth client), then re-run:\n" +
      "  node --env-file=.env scripts/get-refresh-token.ts"
  );
  process.exit(1);
}

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh token back
  prompt: "consent", // forces Google to hand back a refresh token even on repeat runs
  scope: ["https://www.googleapis.com/auth/calendar"],
});

console.log("\nOpen this URL in your browser and sign in with the Google account\nwhose calendar Fade & Co. bookings should go into:\n");
console.log(authUrl);
console.log("\nWaiting for you to approve access...\n");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404).end();
    return;
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`Google returned an error: ${error}. Check the terminal and try again.`);
    console.error(`Google returned an error: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("No authorization code in the callback.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" }).end(
      "Success — you can close this tab and go back to the terminal."
    );

    console.log("Success! Paste this line into apps/backend/.env, replacing the empty GOOGLE_REFRESH_TOKEN= line:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    if (!tokens.refresh_token) {
      console.warn(
        "No refresh_token came back. This happens if you've already granted this app access before.\n" +
          "Go to https://myaccount.google.com/permissions, remove access for this app, and re-run this script."
      );
    }
  } catch (err) {
    console.error("Failed to exchange code for tokens:", err);
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Something went wrong — check the terminal.");
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT);
