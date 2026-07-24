import { google } from "googleapis";

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
}

function oauthClient(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

/** Reads the most recent emails from the connected Gmail account. */
export async function listRecentEmails(
  accessToken: string,
  max = 8
): Promise<EmailSummary[]> {
  const gmail = google.gmail({ version: "v1", auth: oauthClient(accessToken) });
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: max,
    q: "in:inbox -category:promotions -category:social",
  });
  const ids = list.data.messages ?? [];
  const out: EmailSummary[] = [];
  for (const m of ids) {
    if (!m.id) continue;
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = msg.data.payload?.headers ?? [];
    const h = (n: string) =>
      headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ??
      "";
    out.push({
      id: m.id,
      from: h("From"),
      subject: h("Subject"),
      snippet: msg.data.snippet ?? "",
      date: h("Date"),
    });
  }
  return out;
}

/** Reads upcoming events from the connected Google Calendar. */
export async function listUpcomingEvents(
  accessToken: string,
  max = 8
): Promise<CalendarEventSummary[]> {
  const calendar = google.calendar({
    version: "v3",
    auth: oauthClient(accessToken),
  });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: max,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (res.data.items ?? []).map((e) => ({
    id: e.id ?? "",
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    location: e.location ?? undefined,
  }));
}
