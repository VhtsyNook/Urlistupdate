import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    Timestamp,
    where,
    writeBatch,
} from "firebase/firestore";

import { auth, db } from "../config/firebase";

/*
  External Event Service

  ใช้เก็บ event ภายนอก เช่น
  - Google Calendar
  - Microsoft Calendar / Outlook / Teams
  - ตารางเรียน
  - ตารางสอบ
  - นัดหมายจาก calendar อื่น

  path:
  users/{userId}/external_events/{externalEventDocId}
*/

const getCurrentUser = () => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  return {
    userId: user.uid,
    email: user.email || "",
  };
};

const getExternalEventCollectionRef = () => {
  const { userId } = getCurrentUser();
  return collection(db, "users", userId, "external_events");
};

const getExternalEventDocRef = (externalEventDocId) => {
  const { userId } = getCurrentUser();
  return doc(db, "users", userId, "external_events", externalEventDocId);
};

const toTimestamp = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  if (typeof value.toDate === "function") {
    return value;
  }

  return Timestamp.fromDate(new Date(value));
};

const toDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  return new Date(value);
};

const normalizeText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const buildExternalEventDocId = (source, externalEventId) => {
  const safeSource = normalizeText(source, "external")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");

  const safeExternalId = normalizeText(externalEventId, `event_${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  return `${safeSource}_${safeExternalId}`;
};

const detectEventType = (event = {}) => {
  const text = `${event.title || ""} ${event.description || ""}`.toLowerCase();

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

  if (examKeywords.some((keyword) => text.includes(keyword))) {
    return "exam";
  }

  if (classKeywords.some((keyword) => text.includes(keyword))) {
    return "class";
  }

  return "busy";
};

const mapExternalEventDocToObject = (docSnap) => {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    ...data,

    start_time: toDate(data.start_time),
    end_time: toDate(data.end_time),

    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    syncedAt: toDate(data.syncedAt),
  };
};

export const normalizeExternalEvent = (event = {}) => {
  const source = normalizeText(event.source, "external_calendar");
  const externalEventId =
    event.external_event_id ||
    event.google_event_id ||
    event.microsoft_event_id ||
    event.id ||
    `event_${Date.now()}`;

  const startTime = toDate(event.start_time || event.startTime || event.start);
  const endTime = toDate(event.end_time || event.endTime || event.end);

  if (!startTime || !endTime) {
    throw new Error("EXTERNAL_EVENT_TIME_REQUIRED");
  }

  const eventType = event.event_type || detectEventType(event);

  return {
    source,
    external_event_id: normalizeText(externalEventId),

    title: normalizeText(event.title, "Untitled External Event"),
    description: normalizeText(event.description, ""),
    location: normalizeText(event.location, ""),

    start_time: startTime,
    end_time: endTime,

    is_all_day: event.is_all_day === true,
    is_external_event: true,
    is_busy_time: event.is_busy_time !== false,

    event_type: eventType,
    status: event.status || "confirmed",

    html_link: event.html_link || event.web_link || "",
    calendar_id: event.calendar_id || event.google_calendar_id || "",

    source_account_email: event.source_account_email || "",
    source_calendar_name: event.source_calendar_name || "",

    raw: event.raw || null,
  };
};

export const saveExternalEvent = async (event) => {
  const { userId, email } = getCurrentUser();

  const normalizedEvent = normalizeExternalEvent(event);

  const externalEventDocId = buildExternalEventDocId(
    normalizedEvent.source,
    normalizedEvent.external_event_id
  );

  const eventDocRef = getExternalEventDocRef(externalEventDocId);
  const now = Timestamp.now();

  await setDoc(
    eventDocRef,
    {
      ...normalizedEvent,

      user_id: userId,
      user_email: email,

      start_time: toTimestamp(normalizedEvent.start_time),
      end_time: toTimestamp(normalizedEvent.end_time),

      createdAt: now,
      updatedAt: now,
      syncedAt: now,
    },
    {
      merge: true,
    }
  );

  return {
    id: externalEventDocId,
    ...normalizedEvent,
  };
};

export const saveExternalEventsBatch = async (events = []) => {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      success: true,
      saved_count: 0,
    };
  }

  const { userId, email } = getCurrentUser();
  const eventRef = getExternalEventCollectionRef();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  const normalizedEvents = events.map(normalizeExternalEvent);

  normalizedEvents.forEach((event) => {
    const externalEventDocId = buildExternalEventDocId(
      event.source,
      event.external_event_id
    );

    const docRef = doc(eventRef, externalEventDocId);

    batch.set(
      docRef,
      {
        ...event,

        user_id: userId,
        user_email: email,

        start_time: toTimestamp(event.start_time),
        end_time: toTimestamp(event.end_time),

        createdAt: now,
        updatedAt: now,
        syncedAt: now,
      },
      {
        merge: true,
      }
    );
  });

  await batch.commit();

  return {
    success: true,
    saved_count: normalizedEvents.length,
  };
};

export const getExternalEvents = async (options = {}) => {
  const {
    source = null,
    startDate = null,
    endDate = null,
    onlyBusy = true,
  } = options;

  const eventRef = getExternalEventCollectionRef();

  let q = query(eventRef, orderBy("start_time", "asc"));

  if (source) {
    q = query(eventRef, where("source", "==", source));
  }

  const snapshot = await getDocs(q);

  let events = snapshot.docs.map(mapExternalEventDocToObject);

  if (onlyBusy) {
    events = events.filter((event) => event.is_busy_time !== false);
  }

  if (startDate) {
    const start = toDate(startDate);
    events = events.filter((event) => event.end_time >= start);
  }

  if (endDate) {
    const end = toDate(endDate);
    events = events.filter((event) => event.start_time <= end);
  }

  return events;
};

export const listenExternalEvents = (callback, options = {}) => {
  const { source = null } = options;

  const eventRef = getExternalEventCollectionRef();

  const q = source
    ? query(eventRef, where("source", "==", source), orderBy("start_time", "asc"))
    : query(eventRef, orderBy("start_time", "asc"));

  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(mapExternalEventDocToObject);
    callback(events);
  });
};

export const deleteExternalEvent = async (externalEventDocId) => {
  if (!externalEventDocId) {
    throw new Error("externalEventDocId is required");
  }

  const eventDocRef = getExternalEventDocRef(externalEventDocId);
  await deleteDoc(eventDocRef);
};

export const deleteExternalEventsBySource = async (source) => {
  if (!source) {
    throw new Error("source is required");
  }

  const eventRef = getExternalEventCollectionRef();
  const q = query(eventRef, where("source", "==", source));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return {
      success: true,
      deleted_count: 0,
    };
  }

  const batch = writeBatch(db);

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();

  return {
    success: true,
    deleted_count: snapshot.docs.length,
  };
};

export const convertExternalEventsToBusyItems = (externalEvents = []) => {
  return externalEvents
    .filter((event) => event.is_busy_time !== false)
    .map((event) => ({
      id: event.id,
      title: event.title || "External Event",
      detail: event.description || "",

      start_time: event.start_time,
      end_time: event.end_time,

      task_type: event.event_type || "busy",
      priority: event.event_type === "exam" ? "High" : "Medium",

      is_external_event: true,
      is_busy_time: true,
      source: event.source,
      event_type: event.event_type || "busy",

      is_completed: false,
      has_conflict: false,

      location: event.location || "",
    }));
};