export const defaultConfig = Object.freeze({
  compression: {
    minEstimatedReductionPercent: 10,
    minSavingsPercent: 5,
    skipOptimized: true,
    aggressiveScanCompression: true,
    profiles: {
      aggressive: {
        pdfSettings: '/screen',
        colorImageResolution: 110,
        grayImageResolution: 110,
        monoImageResolution: 200,
        jpegQuality: 58
      },
      medium: {
        pdfSettings: '/ebook',
        colorImageResolution: 150,
        grayImageResolution: 150,
        monoImageResolution: 300,
        jpegQuality: 72
      },
      light: {
        pdfSettings: '/printer',
        colorImageResolution: 220,
        grayImageResolution: 220,
        monoImageResolution: 300,
        jpegQuality: 85
      }
    }
  },
  ghostscript: {
    binary: 'gs',
    timeoutMs: 300000
  },
  workers: {
    maxWorkers: 4,
    retryCount: 1
  },
  logging: {
    saveLogs: true,
    logLevel: 'info',
    dashboardRefreshMs: 500
  },
  reports: {
    generateJsonReport: true
  },
  copyAll: {
    enabled: false,
    onConflict: 'skip',
    preserveTimestamps: true
  },
  notifications: {
    enabled: true,
    success: true,
    errors: true,
    warnings: true
  },
  performance: {
    largeFileThresholdMB: 100,
    maxConcurrentLargeFiles: 1,
    analysisReadLimitMB: 64
  },
  safety: {
    safeMode: true,
    lowDiskSpaceWarningMB: 512
  }
});

export const configFileName = 'smart-pdf.config.json';
