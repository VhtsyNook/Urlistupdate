import { GoogleSignin } from "@react-native-google-signin/google-signin";

import {
  deleteExternalEventsBySource,
  saveExternalEventsBatch,
} from "./externalEventService";

const GOOGLE_CALENDAR_SOURCE = "google_calendar";

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

/*
  ใช้ Web Client ID ตัวเดียวกับ app/login.js

  วิธีหา:
  google-services.json
  → หา client_type: 3
  → copy client_id
*/
const WEB_CLIENT_ID = "1065859599553-khsmdvcc9l6ffo60n1i6od514o66c7f3.apps.googleusercontent.com";

const DEFAULT_SYNC_DAYS_BACK = 30;
const DEFAULT_SYNC_DAYS_FORWARD = 120;

let isGoogleConfigured = false;
let calendarAccessPromise = null;

const configureGoogleSignin = () => {
  if (isGoogleConfigured) return;

  if (WEB_CLIENT_ID === "PASTE_YOUR_WEB_CLIENT_ID_HERE") {
    throw new Error("GOOGLE_WEB_CLIENT_ID_REQUIRED");
  }

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
    scopes: GOOGLE_CALENDAR_SCOPES,
  });

  isGoogleConfigured = true;
};

const toISOStringWithOffset = (date) => {
  return new Date(date).toISOString();
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const safeId = (value) => {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 500);
};

const getEventDateTime = (eventDate = {}) => {
  if (eventDate.dateTime) {
    return new Date(eventDate.dateTime);
  }

  if (eventDate.date) {
    const date = new Date(eventDate.date);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  return null;
};

const isAllDayEvent = (event = {}) => {
  return Boolean(event?.start?.date && event?.end?.date);
};

const detectGoogleEventType = ({
  title = "",
  description = "",
  location = "",
}) => {
  const text = `${title} ${description} ${location}`.toLowerCase();

  const examKeywords = [
    "exam",
    "midterm",
    "final",
    "quiz",
    "สอบ",
    "กลางภาค",
    "ปลายภาค",
    "ตารางสอบ",
  ];

  const classKeywords = [
    "class",
    "lecture",
    "lab",
    "เรียน",
    "บรรยาย",
    "ปฏิบัติการ",
    "ตารางเรียน",
  ];

  const meetingKeywords = [
    "teams",
    "meet",
    "zoom",
    "meeting",
    "ประชุม",
    "นัดหมาย",
  ];

  if (examKeywords.some((keyword) => text.includes(keyword))) {
    return "exam";
  }

  if (classKeywords.some((keyword) => text.includes(keyword))) {
    return "class";
  }

  if (meetingKeywords.some((keyword) => text.includes(keyword))) {
    return "meeting";
  }

  return "busy";
};

const normalizeCalendarListItem = (calendar = {}) => {
  return {
    id: calendar.id,
    summary: calendar.summary || calendar.id || "Google Calendar",
    description: calendar.description || "",
    primary: calendar.primary === true,
    accessRole: calendar.accessRole || "",
    selected: calendar.selected !== false,
    backgroundColor: calendar.backgroundColor || "",
    foregroundColor: calendar.foregroundColor || "",
  };
};

const shouldSyncCalendar = (calendar = {}) => {
  if (!calendar.id) return false;

  const accessRole = calendar.accessRole || "";

  if (accessRole === "none") return false;
  if (accessRole === "freeBusyReader") return false;

  return true;
};

const normalizeGoogleCalendarEvent = (
  event = {},
  calendar = { id: "primary", summary: "Primary" }
) => {
  const startTime = getEventDateTime(event.start);
  const endTime = getEventDateTime(event.end);

  if (!startTime || !endTime) {
    return null;
  }

  const calendarId = calendar.id || "primary";
  const calendarName = calendar.summary || calendarId;

  const title = event.summary || "Untitled Google Calendar Event";
  const description = event.description || "";
  const location = event.location || "";

  const eventType = detectGoogleEventType({
    title,
    description,
    location,
  });

  return {
    source: GOOGLE_CALENDAR_SOURCE,

    external_event_id: `${safeId(calendarId)}_${safeId(event.id)}`,

    google_event_id: event.id,
    google_calendar_id: calendarId,

    title,
    description,
    location,

    start_time: startTime,
    end_time: endTime,

    is_all_day: isAllDayEvent(event),
    is_external_event: true,
    is_busy_time: event.transparency !== "transparent",

    event_type: eventType,
    status: event.status || "confirmed",

    html_link: event.htmlLink || "",
    calendar_id: calendarId,
    source_calendar_name: calendarName,

    raw: {
      id: event.id,
      summary: event.summary || "",
      description: event.description || "",
      location: event.location || "",
      status: event.status || "",
      htmlLink: event.htmlLink || "",
      created: event.created || "",
      updated: event.updated || "",
      organizer: event.organizer || null,
      creator: event.creator || null,
      calendarId,
      calendarName,
    },
  };
};

const requestGoogleCalendarAccessInternal = async () => {
  configureGoogleSignin();

  await GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  });

  try {
    await GoogleSignin.signInSilently();
  } catch (error) {
    await GoogleSignin.signIn();
  }

  try {
    await GoogleSignin.addScopes({
      scopes: GOOGLE_CALENDAR_SCOPES,
    });
  } catch (error) {
    console.log("Google addScopes error:", error);

    const message = String(error?.message || "");

    if (message.includes("previous promise did not settle")) {
      throw new Error("GOOGLE_CALENDAR_SCOPE_IN_PROGRESS");
    }

    throw new Error("GOOGLE_CALENDAR_SCOPE_FAILED");
  }

  const tokens = await GoogleSignin.getTokens();

  if (!tokens?.accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_NOT_FOUND");
  }

  return tokens.accessToken;
};

export const requestGoogleCalendarAccess = async () => {
  if (calendarAccessPromise) {
    return calendarAccessPromise;
  }

  calendarAccessPromise = requestGoogleCalendarAccessInternal();

  try {
    const accessToken = await calendarAccessPromise;
    return accessToken;
  } finally {
    calendarAccessPromise = null;
  }
};

export const fetchGoogleCalendarList = async (accessToken) => {
  if (!accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_REQUIRED");
  }

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.log("Google Calendar List API error:", data);

    if (response.status === 401 || response.status === 403) {
      throw new Error("GOOGLE_CALENDAR_PERMISSION_DENIED");
    }

    throw new Error(data?.error?.message || "GOOGLE_CALENDAR_LIST_FAILED");
  }

  const calendars = Array.isArray(data.items) ? data.items : [];

  return calendars
    .map(normalizeCalendarListItem)
    .filter(shouldSyncCalendar);
};

export const fetchGoogleCalendarEvents = async (options = {}) => {
  const {
    accessToken,
    calendarId = "primary",
    calendarName = "Primary",
    daysBack = DEFAULT_SYNC_DAYS_BACK,
    daysForward = DEFAULT_SYNC_DAYS_FORWARD,
  } = options;

  if (!accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_REQUIRED");
  }

  const now = new Date();
  const timeMin = toISOStringWithOffset(addDays(now, -daysBack));
  const timeMax = toISOStringWithOffset(addDays(now, daysForward));

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    maxResults: "2500",
    showDeleted: "false",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.log("Google Calendar Events API error:", {
      calendarId,
      calendarName,
      data,
    });

    if (response.status === 401 || response.status === 403) {
      return [];
    }

    throw new Error(data?.error?.message || "GOOGLE_CALENDAR_FETCH_FAILED");
  }

  const events = Array.isArray(data.items) ? data.items : [];

  return events
    .filter((event) => event.status !== "cancelled")
    .map((event) =>
      normalizeGoogleCalendarEvent(event, {
        id: calendarId,
        summary: calendarName,
      })
    )
    .filter(Boolean);
};

export const fetchAllGoogleCalendarEvents = async (options = {}) => {
  const {
    accessToken,
    daysBack = DEFAULT_SYNC_DAYS_BACK,
    daysForward = DEFAULT_SYNC_DAYS_FORWARD,
  } = options;

  const calendars = await fetchGoogleCalendarList(accessToken);

  if (calendars.length === 0) {
    return {
      calendars: [],
      events: [],
    };
  }

  const allEvents = [];

  for (const calendar of calendars) {
    try {
      const events = await fetchGoogleCalendarEvents({
        accessToken,
        calendarId: calendar.id,
        calendarName: calendar.summary,
        daysBack,
        daysForward,
      });

      allEvents.push(...events);
    } catch (error) {
      console.log("Skip calendar sync error:", {
        calendarId: calendar.id,
        calendarName: calendar.summary,
        error: error?.message,
      });
    }
  }

  return {
    calendars,
    events: allEvents,
  };
};

export const syncGoogleCalendarEvents = async (options = {}) => {
  const {
    calendarId = null,
    daysBack = DEFAULT_SYNC_DAYS_BACK,
    daysForward = DEFAULT_SYNC_DAYS_FORWARD,
    clearOldEvents = false,
    syncAllCalendars = true,
  } = options;

  const accessToken = await requestGoogleCalendarAccess();

  let calendars = [];
  let events = [];

  if (syncAllCalendars) {
    const result = await fetchAllGoogleCalendarEvents({
      accessToken,
      daysBack,
      daysForward,
    });

    calendars = result.calendars;
    events = result.events;
  } else {
    const targetCalendarId = calendarId || "primary";

    events = await fetchGoogleCalendarEvents({
      accessToken,
      calendarId: targetCalendarId,
      calendarName: targetCalendarId,
      daysBack,
      daysForward,
    });

    calendars = [
      {
        id: targetCalendarId,
        summary: targetCalendarId,
      },
    ];
  }

  if (clearOldEvents) {
    await deleteExternalEventsBySource(GOOGLE_CALENDAR_SOURCE);
  }

  const result = await saveExternalEventsBatch(events);

  return {
    success: true,
    source: GOOGLE_CALENDAR_SOURCE,
    synced_count: result.saved_count || 0,
    calendar_count: calendars.length,
    calendars,
    events,
  };
};

export const disconnectGoogleCalendarEvents = async () => {
  // ลบ Google Calendar Events ที่นำเข้าไว้ใน Firestore
  const result = await deleteExternalEventsBySource(
    GOOGLE_CALENDAR_SOURCE
  );

  // เตรียม Google Sign-In configuration ก่อนถอนสิทธิ์
  configureGoogleSignin();

  try {
    await GoogleSignin.revokeAccess();
    console.log("Google Calendar access revoked");
  } catch (error) {
    console.log(
      "Google revoke access skipped:",
      error?.message
    );
  }

  try {
    await GoogleSignin.signOut();
    console.log("Google account signed out");
  } catch (error) {
    console.log(
      "Google sign out skipped:",
      error?.message
    );
  }

  return result;
};