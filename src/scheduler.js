export function isScheduledLocalTime({ date = new Date(), timezone, hour, minute }) {
  const now = getTimeParts(date, timezone);
  return now.hour === hour && now.minute === minute;
}

export function formatLocalTime(date = new Date(), timezone) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "long"
  }).format(date);
}

function getTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}
