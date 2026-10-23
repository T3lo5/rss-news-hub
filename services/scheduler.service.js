import { getNextCronRun, isValidCron } from './cron.js';
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

export function start(ms, fn, { runNow = false } = {}) {
  if (running) return;
  fetchFn = fn;
  intervalMs = ms;
  running = true;
  if (runNow) {
    // Roda o primeiro ciclo já no boot. Sem isso o timer só disparava depois
    // de `ms`, então qualquer reinício da aplicação (ou processo que fica no
    // ar menos que o intervalo) nunca atualizava as notícias sozinho.
    nextRun = Date.now() + intervalMs;
    runOnce(fn).catch((err) => {
      console.warn(`[scheduler] initial fetch failed: ${err?.message || err}`);
    });
  } else {
    scheduleNext();
  }
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
  if (!isValidCron(config.cron)) {
    console.warn(`[newsletter] invalid cron "${config.cron}" - job not scheduled`);
    return;
  }

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
    newsletterJob.timeoutId.unref?.();
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
  // Cancela qualquer timer pendente antes de agendar o próximo. Sem isso,
  // `trigger()` (ou um run manual) agendava um segundo timer e o primeiro
  // ficava órfão — `stop()` só limpa um deles, mantendo o processo vivo e
  // disparando fetches fora de hora.
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }
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
