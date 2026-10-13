import { generateAndSendNewsletter } from './newsletter.service.js';

let intervalId = null;
let fetchFn = null;
let intervalMs = 30 * 60 * 1000;
let running = false;
let lastRun = null;
let nextRun = null;
let lastResult = null;
let currentRunPromise = null;

let newsletterJob = null;
let newsletterNextRun = null;
let newsletterLastRun = null;
let newsletterLastResult = null;

function parseCron(cron) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(' ');
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function getNextCronRun(cron) {
  const now = new Date();
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCron(cron);

  const _candidates = [];
  for (let i = 0; i < 365; i++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + i);
    candidate.setHours(0, 0, 0, 0);

    const matchDayOfWeek =
      dayOfWeek === '*' || dayOfWeek.split(',').includes(String(candidate.getDay()));
    const matchDayOfMonth =
      dayOfMonth === '*' || dayOfMonth.split(',').includes(String(candidate.getDate()));
    const matchMonth = month === '*' || month.split(',').includes(String(candidate.getMonth() + 1));
    const _matchHour = hour === '*' || hour.split(',').includes(String(candidate.getHours()));
    const _matchMinute =
      minute === '*' || minute.split(',').includes(String(candidate.getMinutes()));

    if (matchDayOfWeek && matchDayOfMonth && matchMonth) {
      const runTime = new Date(candidate);
      runTime.setHours(hour === '*' ? now.getHours() : parseInt(hour));
      runTime.setMinutes(minute === '*' ? now.getMinutes() : parseInt(minute));

      if (runTime > now) {
        return runTime.getTime();
      }
    }
  }
  return Date.now() + 24 * 60 * 60 * 1000;
}

export function start(ms, fn) {
  if (running) return;
  fetchFn = fn;
  intervalMs = ms;
  running = true;
  scheduleNext();
}

export function stop() {
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }
  running = false;
  nextRun = null;
}

export function getStatus() {
  return {
    running,
    intervalMs,
    lastRun,
    nextRun,
    lastResult,
    newsletter: {
      running: Boolean(newsletterJob),
      cron: newsletterJob?.cron || null,
      lastRun: newsletterLastRun,
      nextRun: newsletterNextRun,
      lastResult: newsletterLastResult,
    },
  };
}

export async function trigger(fn) {
  const fnToUse = fn || fetchFn;
  if (!fnToUse)
    throw new Error('Scheduler not initialized - call start() first or provide fetchFn');
  return runOnce(fnToUse);
}

export function setIntervalMs(ms) {
  intervalMs = ms;
  if (running) {
    if (intervalId) clearTimeout(intervalId);
    scheduleNext();
  }
}

export function startNewsletterJob(config, newsletterConfig) {
  stopNewsletterJob();

  if (!config.enabled) return;

  const runNewsletter = async () => {
    newsletterLastRun = Date.now();
    try {
      const result = await generateAndSendNewsletter(config, newsletterConfig);
      newsletterLastResult = { ...result, timestamp: Date.now() };
    } catch (err) {
      newsletterLastResult = { error: err.message, timestamp: Date.now() };
    }
    scheduleNewsletterNext(config.cron);
  };

  newsletterJob = { cron: config.cron, run: runNewsletter };
  scheduleNewsletterNext(config.cron);
}

export function stopNewsletterJob() {
  if (newsletterJob) {
    clearTimeout(newsletterJob.timeoutId);
    newsletterJob = null;
    newsletterNextRun = null;
  }
}

function scheduleNewsletterNext(cron) {
  newsletterNextRun = getNextCronRun(cron);
  const delay = newsletterNextRun - Date.now();

  if (newsletterJob) {
    newsletterJob.timeoutId = setTimeout(
      () => {
        if (newsletterJob) {
          newsletterJob.run();
        }
      },
      Math.max(0, delay)
    );
  }
}

async function runOnce(fn) {
  const fnToUse = fn || fetchFn;
  if (currentRunPromise) {
    return { skipped: true, reason: 'Previous run still in progress' };
  }

  lastRun = Date.now();
  currentRunPromise = (async () => {
    try {
      const result = await fnToUse();
      lastResult = { ...result, timestamp: Date.now() };
      return result;
    } catch (err) {
      lastResult = { error: err.message, timestamp: Date.now() };
      throw err;
    } finally {
      currentRunPromise = null;
      if (running) scheduleNext();
    }
  })();

  return currentRunPromise;
}

function scheduleNext() {
  nextRun = Date.now() + intervalMs;
  intervalId = setTimeout(() => {
    runOnce();
  }, intervalMs);
}

export async function __resetScheduler() {
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }
  running = false;
  lastRun = null;
  nextRun = null;
  lastResult = null;
  currentRunPromise = null;
  fetchFn = null;
  intervalMs = 30 * 60 * 1000;

  stopNewsletterJob();
  newsletterLastRun = null;
  newsletterLastResult = null;
}

export function __getNewsletterJob() {
  return newsletterJob;
}

export function __setNewsletterJob(job) {
  newsletterJob = job;
}
