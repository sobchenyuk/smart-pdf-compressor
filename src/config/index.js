import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig, configFileName } from './defaults.js';
import { validateConfig } from './schema.js';

const configSchemaUrl = 'https://raw.githubusercontent.com/cobchenyuk/smart-pdf-compressor/main/schema/smart-pdf.config.schema.json';

export async function loadConfig({ cwd, cliOptions = {} }) {
  const configPath = path.join(cwd, configFileName);
  const exists = await fileExists(configPath);
  const userConfig = exists ? JSON.parse(await fs.readFile(configPath, 'utf8')) : {};
  const merged = deepMerge(structuredClone(defaultConfig), userConfig);
  applyCliOverrides(merged, cliOptions);
  validateConfig(merged);
  return { config: merged, configPath, loadedFromDisk: exists };
}

export async function writeDefaultConfig(cwd, { overwrite = false } = {}) {
  const configPath = path.join(cwd, configFileName);
  if (!overwrite && await fileExists(configPath)) {
    throw new Error(`${configFileName} already exists.`);
  }
  const configWithSchema = { $schema: configSchemaUrl, ...defaultConfig };
  await fs.writeFile(configPath, `${JSON.stringify(configWithSchema, null, 2)}\n`, 'utf8');
  return configPath;
}

export async function resetConfig(cwd) {
  return writeDefaultConfig(cwd, { overwrite: true });
}

export function applyCliOverrides(config, cliOptions) {
  if (cliOptions.verbose) config.logging.logLevel = 'debug';
  if (cliOptions.debug) config.logging.logLevel = 'debug';
  if (cliOptions.silent) config.notifications.enabled = false;
  if (cliOptions.workers !== undefined) config.workers.maxWorkers = Math.min(4, Math.max(1, cliOptions.workers));
  if (cliOptions.copyAll) config.copyAll.enabled = true;
  if (cliOptions.onConflict) config.copyAll.onConflict = cliOptions.onConflict;
  if (cliOptions.retries !== undefined) config.workers.retryCount = cliOptions.retries;
}

export function deepMerge(base, override) {
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      deepMerge(base[key], value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
