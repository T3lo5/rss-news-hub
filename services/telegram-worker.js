import { getTelegramQueue, processTelegramQueue } from './telegram.service.js';

let workerInterval = null;
let isProcessing = false;

export function startTelegramQueueWorker(config, intervalMs = 60000) {
  if (workerInterval) {
    console.log('Telegram queue worker already running');
    return;
  }

  console.log(`Starting Telegram queue worker (interval: ${intervalMs}ms)`);

  workerInterval = setInterval(async () => {
    if (isProcessing) {
      return; // Skip if previous run still processing
    }

    isProcessing = true;
    try {
      await processTelegramQueue(config);
    } catch (err) {
      console.error('Telegram queue worker error:', err);
    } finally {
      isProcessing = false;
    }
  }, intervalMs);

  // Don't prevent process exit
  workerInterval.unref?.();
}

export function stopTelegramQueueWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('Telegram queue worker stopped');
  }
}

export function getTelegramQueueWorkerStatus() {
  return {
    running: !!workerInterval,
    isProcessing,
    queueLength: getTelegramQueue().length,
  };
}
