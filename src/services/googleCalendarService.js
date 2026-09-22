import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";

import { auth, db } from "../config/firebase";

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

const isUrlistGeneratedGoogleEvent = (event = {}) => {
  const privateProperties =
    event.extendedProperties?.private || {};

  return (
    privateProperties.source === "urlist" ||
    Boolean(privateProperties.urlistTaskId)
  );
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

  let googleUser = GoogleSignin.getCurrentUser();

  // ใช้บัญชี Google ที่ล็อกอินเข้าแอปอยู่เท่านั้น
  if (!googleUser) {
    try {
      await GoogleSignin.signInSilently();
      googleUser = GoogleSignin.getCurrentUser();
    } catch (error) {
      throw new Error("GOOGLE_RELOGIN_REQUIRED");
    }
  }

  if (!googleUser) {
    throw new Error("GOOGLE_RELOGIN_REQUIRED");
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

export const requestGoogleCalendarAccessSilently = async () => {
  configureGoogleSignin();

  await GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  });

  try {
    await GoogleSignin.signInSilently();
  } catch (error) {
    throw new Error("GOOGLE_CALENDAR_NOT_CONNECTED");
  }

  const tokens = await GoogleSignin.getTokens();

  if (!tokens?.accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_NOT_FOUND");
  }

  return tokens.accessToken;
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
    .filter(
      (event) =>
        !isUrlistGeneratedGoogleEvent(event)
    )

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

    // true = ดึงแบบเงียบ ไม่เปิดหน้า OAuth
    silent = false,
  } = options;

  const accessToken = silent
    ? await requestGoogleCalendarAccessSilently()
    : await requestGoogleCalendarAccess();

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

const toTaskDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getLocalTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok";
  } catch {
    return "Asia/Bangkok";
  }
};

const buildGoogleEventBodyFromTask = (task = {}) => {
  const startTime = toTaskDate(task.start_time);
  const endTime = toTaskDate(task.end_time);

  if (!startTime || !endTime || endTime <= startTime) {
    throw new Error("URLIST_TASK_TIME_INVALID");
  }

  const descriptionParts = [];

  if (task.detail) {
    descriptionParts.push(String(task.detail));
  }

  descriptionParts.push("สร้างและซิงก์จาก Urlist");

  return {
    summary: task.title || "Urlist Task",
    description: descriptionParts.join("\n\n"),
    start: {
      dateTime: startTime.toISOString(),
      timeZone: getLocalTimeZone(),
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: getLocalTimeZone(),
    },
    extendedProperties: {
      private: {
        urlistTaskId: String(task.id || ""),
        source: "urlist",
      },
    },
  };
};

const requestGoogleCalendarApi = async ({
  accessToken,
  method,
  url,
  body,
}) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `GOOGLE_CALENDAR_${method}_FAILED`
    );

    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

export const createGoogleCalendarEventFromTask = async (
  task,
  options = {}
) => {
  const accessToken =
    options.accessToken || (await requestGoogleCalendarAccess());

  const calendarId = options.calendarId || "primary";
  const eventBody = buildGoogleEventBodyFromTask(task);

  return requestGoogleCalendarApi({
    accessToken,
    method: "POST",
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events`,
    body: eventBody,
  });
};

export const updateGoogleCalendarEventFromTask = async (
  googleEventId,
  task,
  options = {}
) => {
  if (!googleEventId) {
    throw new Error("GOOGLE_EVENT_ID_REQUIRED");
  }

  const accessToken =
    options.accessToken || (await requestGoogleCalendarAccess());

  const calendarId = options.calendarId || "primary";
  const eventBody = buildGoogleEventBodyFromTask(task);

  return requestGoogleCalendarApi({
    accessToken,
    method: "PATCH",
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(googleEventId)}`,
    body: eventBody,
  });
};

export const deleteGoogleCalendarEvent = async (
  googleEventId,
  options = {}
) => {
  if (!googleEventId) {
    return {
      success: true,
      skipped: true,
    };
  }

  const accessToken =
    options.accessToken ||
    (options.silent
      ? await requestGoogleCalendarAccessSilently()
      : await requestGoogleCalendarAccess());

  const calendarId = options.calendarId || "primary";

  await requestGoogleCalendarApi({
    accessToken,
    method: "DELETE",
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(googleEventId)}`,
  });

  return {
    success: true,
    skipped: false,
  };
};

export const syncUrlistTasksToGoogleCalendar = async (options = {}) => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  const calendarId = options.calendarId || "primary";
  const accessToken = options.silent
    ? await requestGoogleCalendarAccessSilently()
    : await requestGoogleCalendarAccess();

  const taskCollectionRef = collection(
    db,
    "users",
    user.uid,
    "tasks"
  );

  const taskSnapshot = await getDocs(taskCollectionRef);

  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const taskDoc of taskSnapshot.docs) {
    const task = {
      id: taskDoc.id,
      ...taskDoc.data(),
    };

    const startTime = toTaskDate(task.start_time);
    const endTime = toTaskDate(task.end_time);

    const isPlanningParent =
      task.planning_enabled === true &&
      task.is_generated_session !== true;

    if (
      !startTime ||
      !endTime ||
      endTime <= startTime ||
      isPlanningParent
    ) {
      skippedCount += 1;
      continue;
    }

    try {
      let googleEvent = null;
      let wasUpdated = false;

      if (task.google_event_id) {
        try {
          googleEvent = await updateGoogleCalendarEventFromTask(
            task.google_event_id,
            task,
            {
              accessToken,
              calendarId:
                task.google_calendar_id || calendarId,
            }
          );

          wasUpdated = true;
        } catch (error) {
          const wasDeletedFromGoogle =
            error?.status === 404 ||
            error?.status === 410;

          if (wasDeletedFromGoogle) {
            console.log(
              "Google event was deleted. Removing linked Urlist task:",
              {
                taskId: taskDoc.id,
                googleEventId: task.google_event_id,
              }
            );

            await deleteDoc(taskDoc.ref);
            deletedCount += 1;

            // ข้ามการสร้าง Event กลับขึ้น Google
            continue;
          }

          throw error;
        }
      }

      if (!googleEvent) {
        googleEvent = await createGoogleCalendarEventFromTask(
          task,
          {
            accessToken,
            calendarId,
          }
        );
      }

      await updateDoc(
        doc(db, "users", user.uid, "tasks", taskDoc.id),
        {
          google_event_id: googleEvent.id,
          google_calendar_id: calendarId,
          google_event_html_link: googleEvent.htmlLink || "",
          google_synced_at: new Date(),
        }
      );

      if (wasUpdated) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    } catch (error) {
      failedCount += 1;

      console.log("Urlist task → Google Calendar sync failed:", {
        taskId: taskDoc.id,
        title: task.title,
        message: error?.message,
        status: error?.status,
      });
    }
  }

  return {
    success: failedCount === 0,
    total_count: taskSnapshot.size,
    created_count: createdCount,
    updated_count: updatedCount,
    deleted_count: deletedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
  };
};

export const disconnectGoogleCalendarEvents = async () => {
  // ลบเฉพาะกิจกรรม Google Calendar ที่นำเข้ามาใน Urlist
  // ไม่ออกจากบัญชี Google เพราะบัญชีนี้ใช้ล็อกอินเข้าแอปอยู่
  const result = await deleteExternalEventsBySource(
    GOOGLE_CALENDAR_SOURCE
  );

  return result;
};
