// Standard 5-field cron parser/scheduler.
//
// Fields: minute hour day-of-month month day-of-week
// Supports: *, values, ranges (a-b), steps (*/n, a-b/n, a/n) and lists (a,b).
// Month and weekday names (JAN..DEC, SUN..SAT) are accepted too.
//
// Day-of-month and day-of-week follow the classic cron rule: when BOTH are
// restricted the job fires if EITHER matches; when one is "*" the other must
// match. This is what makes "0 9 * * 1-5" (weekdays at 09:00) behave as users
// expect — the previous interval-based approximation ignored the time and the
// weekday entirely.

// Compiladas uma vez no módulo: são usadas em laços de validação de campo.
const DIGITS_ONLY = /^\d+$/;
const WHITESPACE = /\s+/;

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const FIELD_RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7], // 7 == Sunday
};

function resolveValue(token, names) {
  const lower = String(token).toLowerCase();
  if (names && Object.prototype.hasOwnProperty.call(names, lower)) return names[lower];
  if (!DIGITS_ONLY.test(lower)) throw new Error(`Invalid cron value: ${token}`);
  return parseInt(lower, 10);
}

// Returns a Set of allowed values, or null when the field is "*" (any).
function parseField(field, name, names) {
  if (field === '*') return null;
  const [min, max] = FIELD_RANGES[name];
  const values = new Set();

  for (const part of field.split(',')) {
    if (part === '') throw new Error(`Invalid cron field: ${field}`);

    let body = part;
    let step = 1;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      body = part.slice(0, slash);
      const stepRaw = part.slice(slash + 1);
      if (!DIGITS_ONLY.test(stepRaw)) throw new Error(`Invalid cron step: ${part}`);
      step = parseInt(stepRaw, 10);
      if (step < 1) throw new Error(`Invalid cron step: ${part}`);
    }

    let start;
    let end;
    if (body === '*') {
      start = min;
      end = max;
    } else if (body.includes('-')) {
      const dashParts = body.split('-');
      if (dashParts.length !== 2) throw new Error(`Invalid cron range: ${part}`);
      start = resolveValue(dashParts[0], names);
      end = resolveValue(dashParts[1], names);
    } else {
      start = resolveValue(body, names);
      end = slash !== -1 ? max : start;
    }

    if (start < min || end > max || start > end) {
      throw new Error(`Cron value out of range for ${name}: ${part}`);
    }

    for (let v = start; v <= end; v += step) values.add(v === 7 ? 0 : v);
  }

  if (values.size === 0) throw new Error(`Empty cron field: ${field}`);
  return values;
}

export function parseCron(expression) {
  if (typeof expression !== 'string') throw new Error('Cron expression must be a string');
  const fields = expression.trim().split(WHITESPACE);
  // Accept an optional leading seconds field (6 fields) by ignoring it.
  const parts = fields.length === 6 ? fields.slice(1) : fields;
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expression}`);

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return {
    minute: parseField(minute, 'minute'),
    hour: parseField(hour, 'hour'),
    dayOfMonth: parseField(dayOfMonth, 'dayOfMonth'),
    month: parseField(month, 'month', MONTHS),
    dayOfWeek: parseField(dayOfWeek, 'dayOfWeek', WEEKDAYS),
    dayOfMonthAny: dayOfMonth === '*',
    dayOfWeekAny: dayOfWeek === '*',
  };
}

export function isValidCron(expression) {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) => i);

// Next run strictly after `fromMs` (defaults to now). Throws on invalid cron
// or when no occurrence is found within ~5 years.
export function getNextCronRun(expression, fromMs = Date.now()) {
  const parsed = parseCron(expression);
  const hours = parsed.hour ? [...parsed.hour].sort((a, b) => a - b) : ALL_HOURS;
  const minutes = parsed.minute ? [...parsed.minute].sort((a, b) => a - b) : ALL_MINUTES;

  const day = new Date(fromMs);
  day.setHours(0, 0, 0, 0);

  const MAX_DAYS = 5 * 366;
  for (let i = 0; i < MAX_DAYS; i++) {
    const monthValue = day.getMonth() + 1;
    const domValue = day.getDate();
    const dowValue = day.getDay();

    const monthOk = parsed.month === null || parsed.month.has(monthValue);
    if (monthOk) {
      const domAny = parsed.dayOfMonthAny;
      const dowAny = parsed.dayOfWeekAny;
      const domOk = domAny || parsed.dayOfMonth.has(domValue);
      const dowOk = dowAny || parsed.dayOfWeek.has(dowValue);
      const dayOk = !(domAny || dowAny) ? domOk || dowOk : domOk && dowOk;

      if (dayOk) {
        for (const h of hours) {
          for (const m of minutes) {
            const candidate = new Date(day);
            candidate.setHours(h, m, 0, 0);
            if (candidate.getTime() > fromMs) return candidate.getTime();
          }
        }
      }
    }

    day.setDate(day.getDate() + 1);
  }

  throw new Error(`No upcoming run found for cron: ${expression}`);
}
