import test from "node:test";
import assert from "node:assert/strict";
import { parseStoredState } from "../src/store.js";

test("stored order and task fields survive a round trip", () => {
  const stored = JSON.stringify({
    version: 1,
    tasks: [
      {
        id: "second",
        name: "Second",
        estimatedHours: 0,
        estimatedMinutes: 20,
        date: "2026-09-29",
        completed: false,
        createdAt: "2026-09-29T09:00:00.000Z",
      },
      {
        id: "first",
        name: "First",
        estimatedHours: 1,
        estimatedMinutes: 0,
        date: "2026-09-29",
        completed: true,
        createdAt: "2026-09-29T08:00:00.000Z",
      },
    ],
  });

  const state = parseStoredState(stored);

  assert.deepEqual(
    state.tasks.map((task) => task.id),
    ["second", "first"],
  );
  assert.equal(state.tasks[1].completed, true);
  assert.equal(state.tasks[0].estimatedMinutes, 20);
});

test("invalid storage returns an empty state", () => {
  assert.deepEqual(parseStoredState("{broken"), {
    version: 1,
    tasks: [],
    focusTimer: null,
  });
});
