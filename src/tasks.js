const MAX_HOURS = 9999;
const MAX_MINUTES = 9999;

export function parseDuration(hoursValue, minutesValue) {
  const hoursText = String(hoursValue ?? "").trim();
  const minutesText = String(minutesValue ?? "").trim();
  const estimatedHours = hoursText === "" ? 0 : Number(hoursText);
  const estimatedMinutes = minutesText === "" ? 0 : Number(minutesText);

  if (
    !Number.isInteger(estimatedHours) ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedHours < 0 ||
    estimatedMinutes < 0 ||
    estimatedHours > MAX_HOURS ||
    estimatedMinutes > MAX_MINUTES
  ) {
    return { error: "Use whole, non-negative numbers." };
  }

  const totalMinutes = estimatedHours * 60 + estimatedMinutes;

  if (totalMinutes === 0) {
    return { error: "Add at least 1 minute." };
  }

  return { estimatedHours, estimatedMinutes, totalMinutes };
}

export function createTask({
  id,
  name,
  estimatedHours,
  estimatedMinutes,
  dateKey,
  createdAt,
}) {
  return {
    id,
    name: name.trim(),
    estimatedHours,
    estimatedMinutes,
    date: dateKey,
    completed: false,
    createdAt,
    completedAt: null,
    carriedAt: null,
  };
}

export function formatDuration(estimatedHours, estimatedMinutes) {
  const parts = [];

  if (estimatedHours > 0) {
    parts.push(`${estimatedHours}h`);
  }

  if (estimatedMinutes > 0) {
    parts.push(`${estimatedMinutes}m`);
  }

  return parts.join(" ");
}

export function groupTasks(tasks, todayKey) {
  const yesterday = [];
  const today = [];

  for (const task of tasks) {
    if (task.date < todayKey && !task.completed) {
      yesterday.push(task);
    } else if (task.date === todayKey && !task.completed) {
      today.push(task);
    }
  }

  return { yesterday, today };
}

export function getDaySummary(tasks, todayKey) {
  const todayTasks = tasks.filter((task) => task.date === todayKey);
  const completedTasks = todayTasks.filter((task) => task.completed);

  return {
    hasTasks: todayTasks.length > 0,
    isComplete: todayTasks.length > 0 && completedTasks.length === todayTasks.length,
    completedTasks,
    focusedMinutes: completedTasks.reduce(
      (total, task) => total + task.estimatedHours * 60 + task.estimatedMinutes,
      0,
    ),
  };
}

export function formatFocusedDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function moveTask(tasks, taskId, destination, targetIndex, todayKey, movedAt) {
  const sourceIndex = tasks.findIndex((task) => task.id === taskId);

  if (sourceIndex === -1) {
    return tasks;
  }

  const sourceTask = tasks[sourceIndex];
  const isDestinationToday = destination === "today";
  const isTaskInDestination = (task) =>
    isDestinationToday
      ? task.date === todayKey && !task.completed
      : task.date < todayKey && !task.completed;
  const canMoveToDestination =
    isDestinationToday || (sourceTask.date < todayKey && !sourceTask.completed);

  if (!canMoveToDestination) {
    return tasks;
  }

  const movedTask = isDestinationToday
    ? {
        ...sourceTask,
        date: todayKey,
        carriedAt: sourceTask.date === todayKey ? sourceTask.carriedAt : movedAt,
      }
    : { ...sourceTask };

  const remaining = tasks.filter((task) => task.id !== taskId);
  const destinationTasks = remaining.filter(isTaskInDestination);
  const safeIndex = Math.max(0, Math.min(targetIndex, destinationTasks.length));
  destinationTasks.splice(safeIndex, 0, movedTask);

  const otherTasks = remaining.filter((task) => !isTaskInDestination(task));
  const yesterdayTasks = isDestinationToday
    ? remaining.filter((task) => task.date < todayKey && !task.completed)
    : destinationTasks;
  const todayTasks = isDestinationToday
    ? destinationTasks
    : remaining.filter((task) => task.date === todayKey);
  const visibleTaskIds = new Set([
    ...yesterdayTasks.map((task) => task.id),
    ...todayTasks.map((task) => task.id),
  ]);
  const hiddenTasks = otherTasks.filter((task) => !visibleTaskIds.has(task.id));

  return [...yesterdayTasks, ...todayTasks, ...hiddenTasks];
}

export function toggleTaskCompletion(tasks, taskId, completedAt) {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          completed: !task.completed,
          completedAt: task.completed ? null : completedAt,
        }
      : task,
  );
}

export function removeTask(tasks, taskId) {
  return tasks.filter((task) => task.id !== taskId);
}
