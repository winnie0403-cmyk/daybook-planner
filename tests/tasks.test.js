import test from "node:test";
import assert from "node:assert/strict";
import {
  createTask,
  formatFocusedDuration,
  formatDuration,
  getDaySummary,
  groupTasks,
  moveTask,
  parseDuration,
  toggleTaskCompletion,
} from "../src/tasks.js";

test("duration accepts hours and minutes independently", () => {
  assert.deepEqual(parseDuration("1", "30"), {
    estimatedHours: 1,
    estimatedMinutes: 30,
    totalMinutes: 90,
  });
  assert.deepEqual(parseDuration("", "45"), {
    estimatedHours: 0,
    estimatedMinutes: 45,
    totalMinutes: 45,
  });
  assert.deepEqual(parseDuration("2", ""), {
    estimatedHours: 2,
    estimatedMinutes: 0,
    totalMinutes: 120,
  });
});

test("duration rejects empty, zero, and negative totals", () => {
  assert.equal(parseDuration("", "").error, "Add at least 1 minute.");
  assert.equal(parseDuration("0", "0").error, "Add at least 1 minute.");
  assert.equal(parseDuration("-1", "30").error, "Use whole, non-negative numbers.");
});

test("duration formatting is concise", () => {
  assert.equal(formatDuration(0, 45), "45m");
  assert.equal(formatDuration(2, 0), "2h");
  assert.equal(formatDuration(1, 30), "1h 30m");
});

test("day summary includes completed tasks and focused minutes", () => {
  const tasks = [
    {
      id: "a",
      name: "First",
      estimatedHours: 1,
      estimatedMinutes: 20,
      date: "2026-09-29",
      completed: true,
    },
    {
      id: "b",
      name: "Second",
      estimatedHours: 2,
      estimatedMinutes: 0,
      date: "2026-09-29",
      completed: true,
    },
  ];

  const summary = getDaySummary(tasks, "2026-09-29");

  assert.equal(summary.isComplete, true);
  assert.equal(summary.completedTasks.length, 2);
  assert.equal(summary.focusedMinutes, 200);
  assert.equal(formatFocusedDuration(summary.focusedMinutes), "3h 20m");
});

test("an empty day is not complete", () => {
  assert.equal(getDaySummary([], "2026-09-29").isComplete, false);
});

test("unfinished older tasks are grouped above today", () => {
  const yesterday = createTask({
    id: "a",
    name: "Calculus",
    estimatedHours: 0,
    estimatedMinutes: 45,
    dateKey: "2026-09-28",
    createdAt: "2026-09-28T08:00:00.000Z",
  });
  const today = createTask({
    id: "b",
    name: "History",
    estimatedHours: 1,
    estimatedMinutes: 0,
    dateKey: "2026-09-29",
    createdAt: "2026-09-29T08:00:00.000Z",
  });

  assert.deepEqual(groupTasks([yesterday, today], "2026-09-29"), {
    yesterday: [yesterday],
    today: [today],
  });
});

test("completed tasks stay in storage but leave the visible groups", () => {
  const completed = createTask({
    id: "done",
    name: "Finished",
    estimatedHours: 0,
    estimatedMinutes: 15,
    dateKey: "2026-09-29",
    createdAt: "2026-09-29T08:00:00.000Z",
  });
  completed.completed = true;

  assert.deepEqual(groupTasks([completed], "2026-09-29"), {
    yesterday: [],
    today: [],
  });
});

test("a yesterday task can move into today at a chosen position", () => {
  const tasks = [
    createTask({
      id: "a",
      name: "Calculus",
      estimatedHours: 0,
      estimatedMinutes: 45,
      dateKey: "2026-09-28",
      createdAt: "2026-09-28T08:00:00.000Z",
    }),
    createTask({
      id: "b",
      name: "History",
      estimatedHours: 0,
      estimatedMinutes: 30,
      dateKey: "2026-09-29",
      createdAt: "2026-09-29T08:00:00.000Z",
    }),
    createTask({
      id: "c",
      name: "Coding",
      estimatedHours: 1,
      estimatedMinutes: 0,
      dateKey: "2026-09-29",
      createdAt: "2026-09-29T09:00:00.000Z",
    }),
  ];

  const moved = moveTask(
    tasks,
    "a",
    "today",
    1,
    "2026-09-29",
    "2026-09-29T10:00:00.000Z",
  );

  assert.deepEqual(
    moved.map((task) => task.name),
    ["History", "Calculus", "Coding"],
  );
  assert.equal(moved[1].date, "2026-09-29");
  assert.equal(moved[1].carriedAt, "2026-09-29T10:00:00.000Z");
});

test("hidden completed tasks do not shift a visible task's drop index", () => {
  const tasks = [
    {
      id: "hidden",
      name: "Previously completed",
      estimatedHours: 0,
      estimatedMinutes: 5,
      date: "2026-09-29",
      completed: true,
    },
    {
      id: "a",
      name: "First",
      estimatedHours: 0,
      estimatedMinutes: 10,
      date: "2026-09-29",
      completed: false,
    },
    {
      id: "b",
      name: "Second",
      estimatedHours: 0,
      estimatedMinutes: 15,
      date: "2026-09-29",
      completed: false,
    },
  ];

  const moved = moveTask(
    tasks,
    "a",
    "today",
    1,
    "2026-09-29",
    "2026-09-29T10:00:00.000Z",
  );

  assert.deepEqual(
    moved.filter((task) => !task.completed).map((task) => task.name),
    ["Second", "First"],
  );
});

test("completion state changes without changing order", () => {
  const tasks = [
    {
      id: "a",
      name: "One",
      estimatedHours: 0,
      estimatedMinutes: 10,
      date: "2026-09-29",
      completed: false,
      completedAt: null,
    },
    {
      id: "b",
      name: "Two",
      estimatedHours: 0,
      estimatedMinutes: 20,
      date: "2026-09-29",
      completed: false,
      completedAt: null,
    },
  ];

  const toggled = toggleTaskCompletion(tasks, "a", "2026-09-29T12:00:00.000Z");

  assert.deepEqual(toggled.map((task) => task.id), ["a", "b"]);
  assert.equal(toggled[0].completed, true);
  assert.equal(toggled[0].completedAt, "2026-09-29T12:00:00.000Z");
});
