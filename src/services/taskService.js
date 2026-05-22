import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../config/firebase";

/*
  โครงสร้างใหม่:
  users/{userId}/tasks/{taskId}

  Task จะไม่อยู่รวมกันใน collection tasks กลางอีกต่อไป
  แต่จะอยู่เป็น subcollection ใต้ user แต่ละคน
*/

const DEFAULT_REPEAT_COUNT = 60;

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

const getTaskCollectionRef = () => {
  const { userId } = getCurrentUser();
  return collection(db, "users", userId, "tasks");
};

const getTaskDocRef = (taskId) => {
  const { userId } = getCurrentUser();
  return doc(db, "users", userId, "tasks", taskId);
};

const toTimestamp = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
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

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getRepeatIntervalDays = (recurrenceType, customIntervalDays) => {
  if (recurrenceType === "everyday") return 1;
  if (recurrenceType === "daily") return 1;

  if (recurrenceType === "everyweek") return 7;
  if (recurrenceType === "weekly") return 7;

  if (recurrenceType === "custom") {
    return Number(customIntervalDays) || 1;
  }

  return null;
};

const isTimeOverlapping = (newStart, newEnd, existingStart, existingEnd) => {
  return newStart < existingEnd && existingStart < newEnd;
};

const getExistingTasksForCurrentUser = async () => {
  const taskRef = getTaskCollectionRef();

  const snapshot = await getDocs(taskRef);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();

    return {
      id: docSnap.id,
      ...data,
      start_time: toDate(data.start_time),
      end_time: toDate(data.end_time),
      completedAt: toDate(data.completedAt),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
      conflict_checked_at: toDate(data.conflict_checked_at),
      conflict_items: Array.isArray(data.conflict_items)
        ? data.conflict_items.map((item) => ({
            ...item,
            start_time: toDate(item.start_time),
            end_time: toDate(item.end_time),
            conflict_instance_start_time: toDate(
              item.conflict_instance_start_time
            ),
            conflict_instance_end_time: toDate(
              item.conflict_instance_end_time
            ),
          }))
        : [],
    };
  });
};

const buildTaskInstances = (task) => {
  const { userId, email } = getCurrentUser();

  const recurrenceType = task.recurrence_type || "none";

  const isRecurring =
    task.is_recurring === true && recurrenceType !== "none";

  const intervalDays = getRepeatIntervalDays(
    recurrenceType,
    task.recurrence_interval_days
  );

  const startDate = new Date(task.start_time);
  const endDate = new Date(task.end_time);

  const durationMs = endDate.getTime() - startDate.getTime();

  const repeatCount = isRecurring ? DEFAULT_REPEAT_COUNT : 1;

  const recurrenceGroupId = isRecurring
    ? task.recurrence_group_id || `recurrence_${Date.now()}`
    : null;

  const instances = [];

  for (let i = 0; i < repeatCount; i++) {
    const instanceStart = isRecurring
      ? addDays(startDate, intervalDays * i)
      : startDate;

    const instanceEnd = new Date(instanceStart.getTime() + durationMs);

    instances.push({
      title: task.title,
      detail: task.detail || "",

      user_id: userId,
      user_email: email,

      start_time: instanceStart,
      end_time: instanceEnd,

      task_type: task.task_type || "fixed",

      status: "active",
      is_completed: false,

      is_recurring: isRecurring,
      recurrence_type: recurrenceType,
      recurrence_interval_days: isRecurring ? intervalDays : null,
      recurrence_index: isRecurring ? i + 1 : null,
      recurrence_group_id: recurrenceGroupId,

      completedAt: null,

      createdAt: task.createdAt || task.created_at || new Date(),
      updatedAt: new Date(),
    });
  }

  return instances;
};

const findConflictsForInstances = async (instances, options = {}) => {
  const { excludeTaskId = null } = options;

  const existingTasks = await getExistingTasksForCurrentUser();

  const conflictsByInstance = instances.map((instance, index) => {
    const conflictItems = existingTasks
      .filter((existingTask) => {
        if (!existingTask.start_time || !existingTask.end_time) return false;

        if (excludeTaskId && existingTask.id === excludeTaskId) {
          return false;
        }

        return isTimeOverlapping(
          instance.start_time,
          instance.end_time,
          existingTask.start_time,
          existingTask.end_time
        );
      })
      .map((existingTask) => ({
        task_id: existingTask.id,
        title: existingTask.title || "Untitled Task",
        start_time: existingTask.start_time,
        end_time: existingTask.end_time,
        recurrence_type: existingTask.recurrence_type || "none",
        recurrence_group_id: existingTask.recurrence_group_id || null,
      }));

    return {
      instance_index: index + 1,
      start_time: instance.start_time,
      end_time: instance.end_time,
      conflicts: conflictItems,
    };
  });

  const conflictInstances = conflictsByInstance.filter(
    (item) => item.conflicts.length > 0
  );

  const allConflictItems = conflictInstances.flatMap((item) =>
    item.conflicts.map((conflict) => ({
      ...conflict,
      conflict_instance_index: item.instance_index,
      conflict_instance_start_time: item.start_time,
      conflict_instance_end_time: item.end_time,
    }))
  );

  const uniqueConflictTaskIds = [
    ...new Set(allConflictItems.map((item) => item.task_id)),
  ];

  return {
    hasConflict: conflictInstances.length > 0,
    conflictInstanceCount: conflictInstances.length,
    conflictCount: allConflictItems.length,
    conflictTaskIds: uniqueConflictTaskIds,
    conflictsByInstance,
    conflictInstances,
    conflictItems: allConflictItems,
  };
};

const serializeConflictItem = (item) => {
  return {
    task_id: item.task_id,
    title: item.title,
    start_time: toTimestamp(item.start_time),
    end_time: toTimestamp(item.end_time),
    recurrence_type: item.recurrence_type || "none",
    recurrence_group_id: item.recurrence_group_id || null,
    conflict_instance_index: item.conflict_instance_index || null,
    conflict_instance_start_time: toTimestamp(
      item.conflict_instance_start_time
    ),
    conflict_instance_end_time: toTimestamp(item.conflict_instance_end_time),
  };
};

const buildConflictSummaryForUI = (conflictResult) => {
  return conflictResult.conflictItems.map((item) => ({
    task_id: item.task_id,
    title: item.title,
    start_time: item.start_time,
    end_time: item.end_time,
    recurrence_type: item.recurrence_type,
    recurrence_group_id: item.recurrence_group_id,
    conflict_instance_index: item.conflict_instance_index,
    conflict_instance_start_time: item.conflict_instance_start_time,
    conflict_instance_end_time: item.conflict_instance_end_time,
  }));
};

export const checkTaskConflicts = async (task, options = {}) => {
  const instances = buildTaskInstances(task);
  const conflictResult = await findConflictsForInstances(instances, options);

  return {
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    conflict_instances: conflictResult.conflictInstances,
    instances,
  };
};

export const addTask = async (task, options = {}) => {
  const { saveAnyway = false, skipConflictCheck = false } = options;

  const taskRef = getTaskCollectionRef();
  const instances = buildTaskInstances(task);

  const conflictResult = skipConflictCheck
    ? {
        hasConflict: false,
        conflictInstanceCount: 0,
        conflictCount: 0,
        conflictTaskIds: [],
        conflictsByInstance: instances.map((instance, index) => ({
          instance_index: index + 1,
          start_time: instance.start_time,
          end_time: instance.end_time,
          conflicts: [],
        })),
        conflictInstances: [],
        conflictItems: [],
      }
    : await findConflictsForInstances(instances);

  if (conflictResult.hasConflict && !saveAnyway) {
    return {
      success: false,
      has_conflict: true,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      message: "TIME_CONFLICT_DETECTED",
    };
  }

  const batch = writeBatch(db);
  const now = Timestamp.now();

  instances.forEach((instance, index) => {
    const conflictForThisInstance =
      conflictResult.conflictsByInstance?.find(
        (item) => item.instance_index === index + 1
      )?.conflicts || [];

    const hasConflictForThisInstance = conflictForThisInstance.length > 0;

    const conflictItemsForThisInstance = conflictForThisInstance.map(
      (conflict) =>
        serializeConflictItem({
          ...conflict,
          conflict_instance_index: index + 1,
          conflict_instance_start_time: instance.start_time,
          conflict_instance_end_time: instance.end_time,
        })
    );

    const newDocRef = doc(taskRef);

    batch.set(newDocRef, {
      title: instance.title,
      detail: instance.detail,

      user_id: instance.user_id,
      user_email: instance.user_email,

      start_time: toTimestamp(instance.start_time),
      end_time: toTimestamp(instance.end_time),

      task_type: instance.task_type,

      status: "active",
      is_completed: false,

      is_recurring: instance.is_recurring,
      recurrence_type: instance.recurrence_type,
      recurrence_interval_days: instance.recurrence_interval_days,
      recurrence_index: instance.recurrence_index,
      recurrence_group_id: instance.recurrence_group_id,

      has_conflict: hasConflictForThisInstance,
      conflict_count: conflictItemsForThisInstance.length,
      conflict_task_ids: conflictItemsForThisInstance.map(
        (item) => item.task_id
      ),
      conflict_items: conflictItemsForThisInstance,
      conflict_checked_at: now,
      save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,

      completedAt: null,

      createdAt: instance.createdAt ? toTimestamp(instance.createdAt) : now,

      updatedAt: now,
    });
  });

  await batch.commit();

  return {
    success: true,
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    created_count: instances.length,
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
  };
};

export const getTaskById = async (taskId) => {
  const taskDocRef = getTaskDocRef(taskId);
  const taskSnapshot = await getDoc(taskDocRef);

  if (!taskSnapshot.exists()) {
    throw new Error("Task not found");
  }

  const data = taskSnapshot.data();

  return {
    id: taskSnapshot.id,
    ...data,
    start_time: toDate(data.start_time),
    end_time: toDate(data.end_time),
    completedAt: toDate(data.completedAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    conflict_checked_at: toDate(data.conflict_checked_at),
    conflict_items: Array.isArray(data.conflict_items)
      ? data.conflict_items.map((item) => ({
          ...item,
          start_time: toDate(item.start_time),
          end_time: toDate(item.end_time),
          conflict_instance_start_time: toDate(
            item.conflict_instance_start_time
          ),
          conflict_instance_end_time: toDate(item.conflict_instance_end_time),
        }))
      : [],
  };
};

export const updateTask = async (taskId, task, options = {}) => {
  const { saveAnyway = false } = options;

  await getTaskById(taskId);

  const candidateInstances = buildTaskInstances({
    ...task,
    is_recurring: false,
    recurrence_type: "none",
  });

  const conflictResult = await findConflictsForInstances(candidateInstances, {
    excludeTaskId: taskId,
  });

  if (conflictResult.hasConflict && !saveAnyway) {
    return {
      success: false,
      has_conflict: true,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      message: "TIME_CONFLICT_DETECTED",
    };
  }

  const conflictItems = conflictResult.conflictItems.map(serializeConflictItem);

  const taskDocRef = getTaskDocRef(taskId);

  await updateDoc(taskDocRef, {
    title: task.title,
    detail: task.detail || "",

    start_time: toTimestamp(task.start_time),
    end_time: toTimestamp(task.end_time),

    task_type: task.task_type || "fixed",

    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: conflictItems,
    conflict_checked_at: Timestamp.now(),
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,

    updatedAt: Timestamp.now(),
  });

  return {
    success: true,
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
  };
};

export const updateTaskStatus = async (taskId, status) => {
  await getTaskById(taskId);

  const taskDocRef = getTaskDocRef(taskId);

  const isCompleted = status === "completed";

  await updateDoc(taskDocRef, {
    status,
    is_completed: isCompleted,
    completedAt: isCompleted ? Timestamp.now() : null,
    updatedAt: Timestamp.now(),
  });
};

export const markTaskDone = async (taskId) => {
  await updateTaskStatus(taskId, "completed");
};

export const undoTaskDone = async (taskId) => {
  await updateTaskStatus(taskId, "active");
};

export const listenTasks = (callback) => {
  const taskRef = getTaskCollectionRef();

  const q = query(taskRef, orderBy("start_time", "asc"));

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        ...data,

        start_time: toDate(data.start_time),
        end_time: toDate(data.end_time),
        completedAt: toDate(data.completedAt),
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
        conflict_checked_at: toDate(data.conflict_checked_at),
        conflict_items: Array.isArray(data.conflict_items)
          ? data.conflict_items.map((item) => ({
              ...item,
              start_time: toDate(item.start_time),
              end_time: toDate(item.end_time),
              conflict_instance_start_time: toDate(
                item.conflict_instance_start_time
              ),
              conflict_instance_end_time: toDate(
                item.conflict_instance_end_time
              ),
            }))
          : [],
      };
    });

    callback(tasks);
  });
};

export const deleteTask = async (taskId) => {
  await getTaskById(taskId);

  const taskDocRef = getTaskDocRef(taskId);

  await deleteDoc(taskDocRef);
};

export const deleteRecurringTaskGroup = async (recurrenceGroupId) => {
  if (!recurrenceGroupId) {
    throw new Error("recurrence_group_id is required");
  }

  const taskRef = getTaskCollectionRef();

  const q = query(
    taskRef,
    where("recurrence_group_id", "==", recurrenceGroupId)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return;
  }

  const batch = writeBatch(db);

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();
};