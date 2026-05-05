export function createQueue({ items, concurrency, retries, worker, logger, onAttempt, onFailure }) {
  let index = 0;

  async function runOne(item) {
    let lastError;
    const attempts = Math.max(1, retries + 1);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        onAttempt?.(item, attempt);
        return await worker(item, attempt);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (attempt < attempts) {
          await logger.warn(`${item.relativePath}: attempt ${attempt} failed, retrying: ${message}`);
        }
      }
    }
    throw lastError;
  }

  async function runWorker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      try {
        await runOne(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logger.error(`${item.relativePath}: failed: ${message}`);
        await onFailure?.(item, message);
      }
    }
  }

  return {
    async run() {
      const workerCount = Math.min(concurrency, items.length || 1);
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    }
  };
}
