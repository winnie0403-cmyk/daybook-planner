const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const yearFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
});

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatFullDate(date = new Date()) {
  return fullDateFormatter.format(date);
}

export function formatYear(date = new Date()) {
  return yearFormatter.format(date);
}

export function formatMonthDay(date = new Date()) {
  return monthDayFormatter.format(date);
}

export function formatTime(date = new Date()) {
  return timeFormatter.format(date);
}

export function getNextMidnight(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 120);
  return next;
}

export function isBeforeDateKey(dateKey, comparisonKey) {
  return dateKey < comparisonKey;
}
