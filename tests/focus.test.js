import test from "node:test";
import assert from "node:assert/strict";
import {
  createFocusTimer,
  FOCUS_MODES,
  formatFocusTime,
  getNextFocusMode,
  getRemainingSeconds,
  sanitizeFocusTimer,
} from "../src/focus.js";

test("focus time uses total minutes and pads seconds", () => {
  assert.equal(formatFocusTime(90 * 60), "90:00");
  assert.equal(formatFocusTime(89 * 60 + 58), "89:58");
  assert.equal(formatFocusTime(0), "00:00");
});

test("remaining time is calculated from the real start time", () => {
  const startedAt = "2026-09-29T10:00:00.000Z";
  const timer = createFocusTimer({
    taskId: "task-1",
    startedAt,
    plannedSeconds: 600,
  });

  assert.equal(getRemainingSeconds(timer, Date.parse("2026-09-29T10:01:30.000Z")), 510);
  assert.equal(getRemainingSeconds(timer, Date.parse("2026-09-29T10:12:00.000Z")), 0);
});

test("focus timer storage keeps only a valid running state", () => {
  const valid = {
    taskId: "task-1",
    startedAt: "2026-09-29T10:00:00.000Z",
    plannedSeconds: 600,
    status: "running",
    mode: FOCUS_MODES.FLOATING,
  };

  assert.deepEqual(sanitizeFocusTimer(valid), valid);
  assert.equal(sanitizeFocusTimer({ ...valid, plannedSeconds: 0 }), null);
  assert.equal(sanitizeFocusTimer({ ...valid, status: "paused" }), null);
});

test("focus mode can alternate without changing timer data", () => {
  assert.equal(getNextFocusMode(FOCUS_MODES.FULLSCREEN), FOCUS_MODES.FLOATING);
  assert.equal(getNextFocusMode(FOCUS_MODES.FLOATING), FOCUS_MODES.FULLSCREEN);
});
