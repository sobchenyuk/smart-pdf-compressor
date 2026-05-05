export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ConflictMode = 'skip' | 'overwrite' | 'rename';
export type CompressionMode = 'aggressive' | 'medium' | 'light';

export interface CompressionProfile {
  pdfSettings: string;
  colorImageResolution: number;
  grayImageResolution: number;
  monoImageResolution: number;
  jpegQuality: number;
}

export interface SmartPdfConfig {
  compression: {
    minEstimatedReductionPercent: number;
    minSavingsPercent: number;
    skipOptimized: boolean;
    aggressiveScanCompression: boolean;
    profiles: Record<CompressionMode, CompressionProfile>;
  };
  ghostscript: {
    binary: string;
    timeoutMs: number;
  };
  workers: {
    maxWorkers: number;
    retryCount: number;
  };
  logging: {
    saveLogs: boolean;
    logLevel: LogLevel;
    dashboardRefreshMs: number;
  };
  reports: {
    generateJsonReport: boolean;
  };
  copyAll: {
    enabled: boolean;
    onConflict: ConflictMode;
    preserveTimestamps: boolean;
  };
  notifications: {
    enabled: boolean;
    success: boolean;
    errors: boolean;
    warnings: boolean;
  };
  performance: {
    largeFileThresholdMB: number;
    maxConcurrentLargeFiles: number;
    analysisReadLimitMB: number;
  };
  safety: {
    safeMode: boolean;
    lowDiskSpaceWarningMB: number;
  };
}

export interface RuntimeCliOptions {
  dryRun?: boolean;
  verbose?: boolean;
  debug?: boolean;
  silent?: boolean;
  copyAll?: boolean;
  onConflict?: ConflictMode;
  workers?: number;
  retries?: number;
}

export interface LoadedConfig {
  config: SmartPdfConfig;
  configPath: string;
  loadedFromDisk: boolean;
}
