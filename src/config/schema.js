const numberFields = new Set([
  'compression.minEstimatedReductionPercent',
  'compression.minSavingsPercent',
  'ghostscript.timeoutMs',
  'workers.maxWorkers',
  'workers.retryCount',
  'logging.dashboardRefreshMs',
  'performance.largeFileThresholdMB',
  'performance.maxConcurrentLargeFiles',
  'performance.analysisReadLimitMB',
  'safety.lowDiskSpaceWarningMB',
  'compression.profiles.aggressive.colorImageResolution',
  'compression.profiles.aggressive.grayImageResolution',
  'compression.profiles.aggressive.monoImageResolution',
  'compression.profiles.aggressive.jpegQuality',
  'compression.profiles.medium.colorImageResolution',
  'compression.profiles.medium.grayImageResolution',
  'compression.profiles.medium.monoImageResolution',
  'compression.profiles.medium.jpegQuality',
  'compression.profiles.light.colorImageResolution',
  'compression.profiles.light.grayImageResolution',
  'compression.profiles.light.monoImageResolution',
  'compression.profiles.light.jpegQuality'
]);

const booleanFields = new Set([
  'compression.skipOptimized',
  'compression.aggressiveScanCompression',
  'logging.saveLogs',
  'reports.generateJsonReport',
  'copyAll.enabled',
  'copyAll.preserveTimestamps',
  'notifications.enabled',
  'notifications.success',
  'notifications.errors',
  'notifications.warnings',
  'safety.safeMode'
]);

const stringFields = new Set([
  'ghostscript.binary',
  'logging.logLevel',
  'copyAll.onConflict',
  'compression.profiles.aggressive.pdfSettings',
  'compression.profiles.medium.pdfSettings',
  'compression.profiles.light.pdfSettings'
]);

export function validateConfig(config) {
  validateNode(config);
  const onConflict = config.copyAll.onConflict;
  if (!['skip', 'overwrite', 'rename'].includes(onConflict)) {
    throw new Error('copyAll.onConflict must be one of: skip, overwrite, rename');
  }
  if (!['debug', 'info', 'warn', 'error'].includes(config.logging.logLevel)) {
    throw new Error('logging.logLevel must be one of: debug, info, warn, error');
  }
  if (config.workers.maxWorkers < 1 || config.workers.maxWorkers > 4) {
    throw new Error('workers.maxWorkers must be a number between 1 and 4');
  }
  if (config.performance.maxConcurrentLargeFiles < 1) {
    throw new Error('performance.maxConcurrentLargeFiles must be a number greater than 0');
  }
}

function validateNode(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${prefix || 'config'} must be an object`);
  }

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (path === '$schema' && typeof child === 'string') continue;
    if (numberFields.has(path) && typeof child !== 'number') {
      throw new Error(`${path} must be a number`);
    }
    if (booleanFields.has(path) && typeof child !== 'boolean') {
      throw new Error(`${path} must be a boolean`);
    }
    if (stringFields.has(path) && typeof child !== 'string') {
      throw new Error(`${path} must be a string`);
    }
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      validateNode(child, path);
    }
  }
}
