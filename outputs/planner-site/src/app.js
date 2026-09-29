import {
  formatFullDate,
  formatMonthDay,
  formatTime,
  formatYear,
  getDateKey,
  getNextMidnight,
} from "./date.js";
import { createDragController } from "./drag-controller.js";
import {
  createFocusTimer,
  FOCUS_MODES,
  formatFocusTime,
  getNextFocusMode,
  getRemainingSeconds,
} from "./focus.js";
import {
  exitBrowserFullscreen,
  isFullscreenElement,
  requestElementFullscreen,
} from "./fullscreen.js";
import { createPlannerStore } from "./store.js";
import {
  createTask,
  formatFocusedDuration,
  formatDuration,
  getDaySummary,
  groupTasks,
  moveTask,
  parseDuration,
  removeTask,
  toggleTaskCompletion,
} from "./tasks.js";

const LONG_PRESS_MS = 800;
const POINTER_CANCEL_DISTANCE = 9;
const EARLY_EXIT_PHRASE = "我确认这是我的主动选择，我接受提前结束本次专注。";

const elements = {
  currentDate: document.querySelector("#current-date"),
  currentYear: document.querySelector("#current-year"),
  currentTime: document.querySelector("#current-time"),
  yesterdaySection: document.querySelector("#yesterday-section"),
  yesterdayList: document.querySelector("#yesterday-list"),
  todayList: document.querySelector("#today-list"),
  emptyState: document.querySelector("#empty-state"),
  startFocus: document.querySelector("#start-focus"),
  focusView: document.querySelector("#focus-view"),
  focusTaskName: document.querySelector("#focus-task-name"),
  focusTime: document.querySelector("#focus-time"),
  focusModeToggle: document.querySelector("#focus-mode-toggle"),
  focusExit: document.querySelector("#focus-exit"),
  focusExitConfirmation: document.querySelector("#focus-exit-confirmation"),
  focusExitForm: document.querySelector("#focus-exit-form"),
  focusExitInput: document.querySelector("#focus-exit-input"),
  focusExitError: document.querySelector("#focus-exit-error"),
  focusExitCancel: document.querySelector("#focus-exit-cancel"),
  focusExitConfirm: document.querySelector("#focus-exit-confirm"),
  dayComplete: document.querySelector("#day-complete"),
  dayCompleteDate: document.querySelector("#day-complete-date"),
  dayCompleteToggle: document.querySelector("#day-complete-toggle"),
  dayCompleteCount: document.querySelector("#day-complete-count"),
  dayCompleteFocused: document.querySelector("#day-complete-focused"),
  dayCompleteDetails: document.querySelector("#day-complete-details"),
  dayCompleteList: document.querySelector("#day-complete-list"),
  dayCompleteMoment: document.querySelector("#day-complete-moment"),
  dayCompleteMore: document.querySelector("#day-complete-more"),
  planner: document.querySelector("#planner"),
  openAddForm: document.querySelector("#open-add-form"),
  addTaskForm: document.querySelector("#add-task-form"),
  cancelAddForm: document.querySelector("#cancel-add-form"),
  taskName: document.querySelector("#task-name"),
  taskHours: document.querySelector("#task-hours"),
  taskMinutes: document.querySelector("#task-minutes"),
  formError: document.querySelector("#form-error"),
  liveRegion: document.querySelector("#live-region"),
};

const store = createPlannerStore();
const state = store.read();
let todayKey = getDateKey();
let pendingDeleteId = null;
let pressState = null;
let midnightTimer = null;
let focusTimerInterval = null;
let dayCompleteDismissed = false;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function taskRowTemplate(task, { inYesterday = false } = {}) {
  const isConfirming = pendingDeleteId === task.id;
  const completedClass = task.completed ? " is-completed" : "";

  if (isConfirming) {
    return `
      <li class="task-row${completedClass}" data-task-id="${escapeHtml(task.id)}">
        <div class="task-confirmation">
          <p class="confirmation-copy">Delete <strong>${escapeHtml(task.name)}</strong>?</p>
          <div class="confirmation-actions">
            <button class="confirmation-button" type="button" data-action="cancel-delete">
              Cancel
            </button>
            <button class="confirmation-button delete" type="button" data-action="confirm-delete">
              Delete
            </button>
          </div>
        </div>
      </li>
    `;
  }

  const completionLabel = task.completed
    ? `Mark ${task.name} as not completed`
    : `Mark ${task.name} as completed`;
  const dragLabel = inYesterday
    ? `Drag ${task.name} to reorder or move it to today`
    : `Drag ${task.name} to reorder`;

  return `
    <li class="task-row${completedClass}" data-task-id="${escapeHtml(task.id)}">
      <button
        class="task-check"
        type="button"
        data-action="toggle-complete"
        aria-label="${escapeHtml(completionLabel)}"
        aria-pressed="${task.completed}"
      ></button>
      <span class="task-name">${escapeHtml(task.name)}</span>
      <span class="task-duration">${formatDuration(
        task.estimatedHours,
        task.estimatedMinutes,
      )}</span>
      <button
        class="drag-handle"
        type="button"
        data-drag-handle
        aria-label="${escapeHtml(dragLabel)}"
      ></button>
    </li>
  `;
}

function persist() {
  store.write(state);
}

function renderDate() {
  const now = new Date();
  elements.currentDate.textContent = formatFullDate(now);
  elements.currentYear.textContent = formatYear(now);
  elements.currentTime.textContent = formatTime(now);
}

function renderTasks() {
  const groups = groupTasks(state.tasks, todayKey);
  const yesterdayHtml = groups.yesterday
    .map((task) => taskRowTemplate(task, { inYesterday: true }))
    .join("");
  const todayHtml = groups.today.map((task) => taskRowTemplate(task)).join("");

  elements.yesterdaySection.hidden = groups.yesterday.length === 0;
  elements.yesterdayList.innerHTML = yesterdayHtml;
  elements.todayList.innerHTML = todayHtml;
  elements.emptyState.hidden = groups.today.length > 0 || pendingDeleteId !== null;
  elements.startFocus.disabled = groups.today.length === 0;
}

function render() {
  renderDate();
  renderTasks();
}

function resetDayCompleteDetails() {
  elements.dayCompleteDetails.classList.remove("is-open");
  elements.dayCompleteDetails.setAttribute("aria-hidden", "true");
  elements.dayCompleteToggle.setAttribute("aria-expanded", "false");
}

function renderDayComplete(summary) {
  const completedCount = summary.completedTasks.length;
  elements.dayCompleteDate.textContent = formatMonthDay(new Date());
  elements.dayCompleteCount.textContent = `${completedCount} ${
    completedCount === 1 ? "task" : "tasks"
  } completed`;
  elements.dayCompleteFocused.textContent = `Focused for ${formatFocusedDuration(
    summary.focusedMinutes,
  )}`;
  elements.dayCompleteList.innerHTML = summary.completedTasks
    .map(
      (task) => `
        <li class="day-complete-list-item">
          <span class="day-complete-check" aria-hidden="true"></span>
          <span class="day-complete-list-name">${escapeHtml(task.name)}</span>
          <span class="day-complete-list-duration">${formatDuration(
            task.estimatedHours,
            task.estimatedMinutes,
          )}</span>
        </li>
      `,
    )
    .join("");
  resetDayCompleteDetails();
}

function showDayComplete() {
  const summary = getDaySummary(state.tasks, todayKey);

  if (
    !summary.isComplete ||
    state.focusTimer ||
    dayCompleteDismissed
  ) {
    return false;
  }

  renderDayComplete(summary);
  elements.dayComplete.hidden = false;
  document.body.classList.add("is-day-complete");
  return true;
}

function hideDayComplete({ markDismissed = true } = {}) {
  elements.dayComplete.hidden = true;
  document.body.classList.remove("is-day-complete");
  resetDayCompleteDetails();

  if (markDismissed) {
    dayCompleteDismissed = true;
  }
}

function toggleDayCompleteDetails() {
  const isOpen = elements.dayCompleteDetails.classList.toggle("is-open");
  elements.dayCompleteDetails.setAttribute("aria-hidden", String(!isOpen));
  elements.dayCompleteToggle.setAttribute("aria-expanded", String(isOpen));
}

function announce(message) {
  elements.liveRegion.textContent = "";
  window.requestAnimationFrame(() => {
    elements.liveRegion.textContent = message;
  });
}

function clearPress() {
  if (!pressState) {
    return;
  }

  window.clearTimeout(pressState.timer);
  pressState.row.classList.remove("is-holding");
  pressState = null;
}

function beginLongPress(event) {
  if (
    event.button !== 0 ||
    pendingDeleteId ||
    event.target.closest("button, input, form, [data-drag-handle]")
  ) {
    return;
  }

  const row = event.target.closest("[data-task-id]");

  if (!row) {
    return;
  }

  clearPress();
  const taskId = row.dataset.taskId;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const timer = window.setTimeout(() => {
    if (!pressState || pressState.pointerId !== pointerId) {
      return;
    }

    clearPress();
    pendingDeleteId = taskId;
    renderTasks();
    announce("Delete confirmation opened.");
  }, LONG_PRESS_MS);

  pressState = {
    pointerId,
    taskId,
    row,
    startX,
    startY,
    timer,
  };
  row.classList.add("is-holding");
}

function moveLongPress(event) {
  if (!pressState || event.pointerId !== pressState.pointerId) {
    return;
  }

  const distance = Math.hypot(event.clientX - pressState.startX, event.clientY - pressState.startY);

  if (distance > POINTER_CANCEL_DISTANCE) {
    clearPress();
  }
}

function endLongPress(event) {
  if (pressState && event.pointerId === pressState.pointerId) {
    clearPress();
  }
}

function openAddForm() {
  elements.openAddForm.hidden = true;
  elements.addTaskForm.hidden = false;
  elements.formError.textContent = "";
  elements.taskName.focus();
}

function closeAddForm() {
  elements.addTaskForm.reset();
  elements.addTaskForm.hidden = true;
  elements.openAddForm.hidden = false;
  elements.formError.textContent = "";
  elements.openAddForm.focus();
}

function sanitizeNumericInput(event) {
  event.target.value = event.target.value.replace(/\D/g, "");
}

function submitTask(event) {
  event.preventDefault();
  const name = elements.taskName.value.trim();
  const duration = parseDuration(elements.taskHours.value, elements.taskMinutes.value);

  if (!name) {
    elements.formError.textContent = "Enter a task name.";
    elements.taskName.focus();
    return;
  }

  if (duration.error) {
    elements.formError.textContent = duration.error;
    (duration.error.includes("minute") ? elements.taskMinutes : elements.taskHours).focus();
    return;
  }

  const now = new Date();
  const task = createTask({
    id: crypto.randomUUID(),
    name,
    estimatedHours: duration.estimatedHours,
    estimatedMinutes: duration.estimatedMinutes,
    dateKey: todayKey,
    createdAt: now.toISOString(),
  });

  dayCompleteDismissed = false;
  hideDayComplete({ markDismissed: false });
  state.tasks.push(task);
  persist();
  renderTasks();
  closeAddForm();
  announce(`${task.name} added to today.`);
}

function toggleTask(taskId) {
  const taskBeforeToggle = state.tasks.find((candidate) => candidate.id === taskId);
  state.tasks = toggleTaskCompletion(state.tasks, taskId, new Date().toISOString());
  persist();

  const task = state.tasks.find((candidate) => candidate.id === taskId);

  if (!task || !taskBeforeToggle) {
    renderTasks();
    return;
  }

  if (!task.completed) {
    renderTasks();
    announce(`${task.name} restored.`);
    return;
  }

  const row = document.querySelector(`[data-task-id="${taskId}"]`);

  if (!row) {
    renderTasks();
    announce(`${task.name} completed.`);
    return;
  }

  const checkButton = row.querySelector(".task-check");
  let finished = false;
  let fallbackTimer;

  row.style.setProperty("--task-row-height", `${row.getBoundingClientRect().height}px`);
  row.classList.add("is-completed", "is-completing");
  checkButton?.setAttribute("aria-pressed", "true");

  if (checkButton) {
    checkButton.disabled = true;
  }

  function finishCompletion() {
    if (finished) {
      return;
    }

    finished = true;
    window.clearTimeout(fallbackTimer);
    row.remove();
    renderTasks();
    showDayComplete();
    announce(`${task.name} completed.`);
  }

  row.addEventListener(
    "animationend",
    (event) => {
      if (event.target === row && event.animationName === "task-complete") {
        finishCompletion();
      }
    },
    { once: true },
  );

  fallbackTimer = window.setTimeout(finishCompletion, 700);
}

function confirmDelete() {
  const task = state.tasks.find((candidate) => candidate.id === pendingDeleteId);
  state.tasks = removeTask(state.tasks, pendingDeleteId);
  pendingDeleteId = null;
  persist();
  renderTasks();
  showDayComplete();

  if (task) {
    announce(`${task.name} deleted.`);
  }
}

function cancelDelete() {
  pendingDeleteId = null;
  renderTasks();
  announce("Delete cancelled.");
}

function handleTaskAction(event) {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  const row = actionButton.closest("[data-task-id]");
  const taskId = row?.dataset.taskId;

  if (action === "toggle-complete" && taskId) {
    toggleTask(taskId);
  } else if (action === "cancel-delete") {
    cancelDelete();
  } else if (action === "confirm-delete") {
    confirmDelete();
  }
}

function handleDrop({ taskId, destination, targetIndex }) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    return;
  }

  const movedToToday = task.date !== todayKey && destination === "today";
  state.tasks = moveTask(
    state.tasks,
    taskId,
    destination,
    targetIndex,
    todayKey,
    new Date().toISOString(),
  );
  persist();
  renderTasks();

  announce(movedToToday ? `${task.name} moved to today.` : `${task.name} reordered.`);
}

function checkForDateChange() {
  const currentKey = getDateKey();

  if (currentKey !== todayKey) {
    todayKey = currentKey;
    pendingDeleteId = null;
    dayCompleteDismissed = false;
    hideDayComplete({ markDismissed: false });
    clearPress();
    render();
    showDayComplete();
  }
}

function scheduleMidnightCheck() {
  window.clearTimeout(midnightTimer);
  const delay = getNextMidnight().getTime() - Date.now();
  midnightTimer = window.setTimeout(() => {
    checkForDateChange();
    renderDate();
    scheduleMidnightCheck();
  }, Math.max(delay, 1000));
}

function getFocusTask() {
  if (!state.focusTimer) {
    return null;
  }

  return state.tasks.find((task) => task.id === state.focusTimer.taskId) || null;
}

function stopFocusInterval() {
  window.clearInterval(focusTimerInterval);
  focusTimerInterval = null;
}

function syncFocusMode() {
  const mode = state.focusTimer?.mode || FOCUS_MODES.FULLSCREEN;
  const isFloating = mode === FOCUS_MODES.FLOATING;
  const isBrowserFullscreen = isFullscreenElement(elements.focusView);
  const nextModeLabel = isFloating
    ? "fullscreen"
    : isBrowserFullscreen
      ? "floating"
      : "fullscreen";

  elements.focusView.dataset.mode = mode;
  elements.focusModeToggle.setAttribute("aria-label", `Switch to ${nextModeLabel} focus`);
  elements.focusModeToggle.title = `Switch to ${nextModeLabel} focus`;
  document.body.classList.toggle("is-focus-fullscreen", !isFloating);
}

function resetFocusExitConfirmation() {
  elements.focusExitConfirmation.hidden = true;
  elements.focusExitInput.value = "";
  elements.focusExitError.textContent = "";
  elements.focusExitConfirm.disabled = true;
  elements.focusView.classList.remove("is-exit-confirming");
}

function hideFocusTimer() {
  stopFocusInterval();
  resetFocusExitConfirmation();
  void exitBrowserFullscreen();
  elements.focusView.hidden = true;
  document.body.classList.remove("is-focus-fullscreen");
}

function completeFocusTimer() {
  const focusTimer = state.focusTimer;

  if (!focusTimer) {
    return;
  }

  const task = state.tasks.find((candidate) => candidate.id === focusTimer.taskId);
  state.focusTimer = null;
  persist();
  hideFocusTimer();

  if (task && !task.completed) {
    toggleTask(task.id);
  } else {
    renderTasks();
  }
}

function updateFocusClock() {
  if (!state.focusTimer) {
    return;
  }

  const remainingSeconds = getRemainingSeconds(state.focusTimer);
  elements.focusTime.textContent = formatFocusTime(remainingSeconds);
  elements.focusTime.dateTime = `PT${remainingSeconds}S`;

  if (remainingSeconds === 0) {
    completeFocusTimer();
  }
}

function showFocusTimer() {
  const task = getFocusTask();

  if (!state.focusTimer || !task || task.completed) {
    state.focusTimer = null;
    persist();
    hideFocusTimer();
    renderTasks();
    return;
  }

  elements.focusTaskName.textContent = task.name;
  elements.focusView.hidden = false;
  syncFocusMode();
  stopFocusInterval();
  focusTimerInterval = window.setInterval(updateFocusClock, 250);
  updateFocusClock();
}

function startFocusTimer() {
  const firstTask = groupTasks(state.tasks, todayKey).today[0];

  if (!firstTask) {
    return;
  }

  state.focusTimer = createFocusTimer({
    taskId: firstTask.id,
    startedAt: new Date().toISOString(),
    plannedSeconds:
      (firstTask.estimatedHours * 60 + firstTask.estimatedMinutes) * 60,
    mode: FOCUS_MODES.FULLSCREEN,
  });
  persist();
  showFocusTimer();
  void requestElementFullscreen(elements.focusView);
}

function toggleFocusMode() {
  if (!state.focusTimer) {
    return;
  }

  if (
    state.focusTimer.mode === FOCUS_MODES.FULLSCREEN &&
    !isFullscreenElement(elements.focusView)
  ) {
    void requestElementFullscreen(elements.focusView);
    announce("Fullscreen focus enabled.");
    return;
  }

  const nextMode = getNextFocusMode(state.focusTimer.mode);
  state.focusTimer = {
    ...state.focusTimer,
    mode: nextMode,
  };
  persist();
  syncFocusMode();

  if (nextMode === FOCUS_MODES.FLOATING) {
    void exitBrowserFullscreen();
  } else {
    void requestElementFullscreen(elements.focusView);
  }

  announce(
    nextMode === FOCUS_MODES.FLOATING
      ? "Floating focus enabled."
      : "Fullscreen focus enabled.",
  );
}

function openFocusExitConfirmation() {
  if (!state.focusTimer) {
    return;
  }

  elements.focusExitConfirmation.hidden = false;
  elements.focusView.classList.add("is-exit-confirming");
  elements.focusExitInput.value = "";
  elements.focusExitError.textContent = "";
  elements.focusExitConfirm.disabled = true;
  elements.focusExitInput.focus();
}

function cancelFocusExit() {
  resetFocusExitConfirmation();
  elements.focusModeToggle.focus();
}

function validateFocusExitInput() {
  const isValid = elements.focusExitInput.value === EARLY_EXIT_PHRASE;
  elements.focusExitConfirm.disabled = !isValid;
  elements.focusExitError.textContent = "";
}

function submitFocusExit(event) {
  event.preventDefault();

  if (elements.focusExitInput.value !== EARLY_EXIT_PHRASE) {
    elements.focusExitError.textContent = "The sentence does not match.";
    elements.focusExitInput.focus();
    return;
  }

  resetFocusExitConfirmation();
  completeFocusTimer();
}

elements.startFocus.addEventListener("click", startFocusTimer);
elements.focusModeToggle.addEventListener("click", toggleFocusMode);
elements.focusExit.addEventListener("click", openFocusExitConfirmation);
elements.focusExitCancel.addEventListener("click", cancelFocusExit);
elements.focusExitInput.addEventListener("input", validateFocusExitInput);
elements.focusExitForm.addEventListener("submit", submitFocusExit);
elements.dayCompleteToggle.addEventListener("click", toggleDayCompleteDetails);
elements.dayCompleteMoment.addEventListener("click", () => {
  hideDayComplete();
  announce("Day summary closed.");
});
elements.dayCompleteMore.addEventListener("click", () => {
  hideDayComplete();
  openAddForm();
  announce("Add a new task for today.");
});
elements.openAddForm.addEventListener("click", openAddForm);
elements.cancelAddForm.addEventListener("click", closeAddForm);
elements.addTaskForm.addEventListener("submit", submitTask);
elements.taskHours.addEventListener("input", sanitizeNumericInput);
elements.taskMinutes.addEventListener("input", sanitizeNumericInput);
elements.planner.addEventListener("click", handleTaskAction);
elements.planner.addEventListener("pointerdown", beginLongPress);
elements.planner.addEventListener("contextmenu", (event) => {
  if (event.target.closest("[data-task-id]")) {
    event.preventDefault();
  }
});
window.addEventListener("pointermove", moveLongPress);
window.addEventListener("pointerup", endLongPress);
window.addEventListener("pointercancel", endLongPress);
document.addEventListener("fullscreenchange", syncFocusMode);
window.addEventListener("focus", () => {
  checkForDateChange();
  updateFocusClock();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    checkForDateChange();
    renderDate();
    updateFocusClock();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.addTaskForm.hidden) {
    closeAddForm();
  } else if (pendingDeleteId) {
    cancelDelete();
  }
});

createDragController({
  root: elements.planner,
  canDrop({ taskId, destination }) {
    const task = state.tasks.find((candidate) => candidate.id === taskId);

    if (!task || destination !== "today" && destination !== "yesterday") {
      return false;
    }

    return destination === "today" || task.date < todayKey;
  },
  onDrop: handleDrop,
});

render();
showFocusTimer();
showDayComplete();
scheduleMidnightCheck();

window.setInterval(() => {
  checkForDateChange();
  renderDate();
}, 30_000);
