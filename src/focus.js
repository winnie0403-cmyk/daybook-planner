export const FOCUS_MODES = Object.freeze({
  FULLSCREEN: "fullscreen",
  FLOATING: "floating",
});

export function createFocusTimer({
  taskId,
  startedAt,
  plannedSeconds,
  mode = FOCUS_MODES.FULLSCREEN,
}) {
  return {
    taskId,
    startedAt,
    plannedSeconds,
    status: "running",
    mode,
  };
}

export function sanitizeFocusTimer(value) {
  if (!value || typeof value !== "object" || value.status !== "running") {
    return null;
  }

  const plannedSeconds = Number(value.plannedSeconds);
  const startedAtTime = Date.parse(value.startedAt);

  if (
    typeof value.taskId !== "string" ||
    value.taskId === "" ||
    !Number.isInteger(plannedSeconds) ||
    plannedSeconds <= 0 ||
    !Number.isFinite(startedAtTime)
  ) {
    return null;
  }

  return {
    taskId: value.taskId,
    startedAt: new Date(startedAtTime).toISOString(),
    plannedSeconds,
    status: "running",
    mode: value.mode === FOCUS_MODES.FLOATING ? FOCUS_MODES.FLOATING : FOCUS_MODES.FULLSCREEN,
  };
}

export function getRemainingSeconds(focusTimer, now = Date.now()) {
  const startedAtTime = Date.parse(focusTimer.startedAt);

  if (!Number.isFinite(startedAtTime)) {
    return 0;
  }

  const elapsedSeconds = Math.floor(Math.max(0, now - startedAtTime) / 1000);
  return Math.max(0, focusTimer.plannedSeconds - elapsedSeconds);
}

export function formatFocusTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getNextFocusMode(mode) {
  return mode === FOCUS_MODES.FULLSCREEN ? FOCUS_MODES.FLOATING : FOCUS_MODES.FULLSCREEN;
}
