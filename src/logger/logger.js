import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };

export async function createLogger({ logDir, level = 'info', consoleEnabled = true, saveLogs = true }) {
  let stream = null;
  let logFile = null;
  if (saveLogs) {
    await fsp.mkdir(logDir, { recursive: true });
    logFile = path.join(logDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    stream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  const threshold = levels[level] ?? levels.info;

  async function write(entryLevel, message) {
    if ((levels[entryLevel] ?? levels.info) < threshold) return;
    const line = `${new Date().toISOString()} ${entryLevel.toUpperCase()} ${message}\n`;
    if (stream) stream.write(line);
    if (consoleEnabled) {
      const target = entryLevel === 'error' ? console.error : entryLevel === 'warn' ? console.warn : console.log;
      target(line.trimEnd());
    }
  }

  return {
    file: logFile,
    debug: (message) => write('debug', message),
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
    close: () => new Promise((resolve) => {
      if (!stream) resolve();
      else stream.end(resolve);
    })
  };
}
