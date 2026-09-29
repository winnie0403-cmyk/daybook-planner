import { sanitizeFocusTimer } from "./focus.js";

const STORAGE_KEY = "daybook.list.v1";

export function createInitialState() {
  return {
    version: 1,
    tasks: [],
    focusTimer: null,
  };
}

function isValidDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeTask(task) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const estimatedHours = Number(task.estimatedHours);
  const estimatedMinutes = Number(task.estimatedMinutes);

  if (
    typeof task.id !== "string" ||
    typeof task.name !== "string" ||
    task.name.trim() === "" ||
    !isValidDateKey(task.date) ||
    !Number.isInteger(estimatedHours) ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedHours < 0 ||
    estimatedMinutes < 0
  ) {
    return null;
  }

  return {
    id: task.id,
    name: task.name.trim(),
    estimatedHours,
    estimatedMinutes,
    date: task.date,
    completed: Boolean(task.completed),
    createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
    completedAt: typeof task.completedAt === "string" ? task.completedAt : null,
    carriedAt: typeof task.carriedAt === "string" ? task.carriedAt : null,
  };
}

export function parseStoredState(rawValue) {
  if (!rawValue) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
      return createInitialState();
    }

    return {
      version: 1,
      tasks: parsed.tasks.map(sanitizeTask).filter(Boolean),
      focusTimer: sanitizeFocusTimer(parsed.focusTimer),
    };
  } catch {
    return createInitialState();
  }
}

export function createPlannerStore(storage = window.localStorage) {
  let memoryState = createInitialState();

  function read() {
    try {
      return parseStoredState(storage.getItem(STORAGE_KEY));
    } catch {
      return memoryState;
    }
  }

  function write(state) {
    memoryState = state;

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The in-memory copy keeps the current session usable if storage is blocked.
    }
  }

  return { read, write };
}

export { STORAGE_KEY };
