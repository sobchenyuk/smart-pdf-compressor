import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDirectory } from '../utils/fs.js';

export async function writeReports({ outputFolder, stats, logger, enabled = true }) {
  if (!enabled) return null;
  const reportDir = path.join(outputFolder, '.smart-pdf-compressor');
  await ensureDirectory(reportDir);
  const reportPath = path.join(reportDir, 'report.json');
  const report = {
    processedPdf: stats.processedPdf,
    compressedPdf: stats.compressedPdf,
    skippedPdf: stats.skippedPdf,
    copiedFiles: stats.copiedFiles,
    failed: stats.failed,
    originalBytes: stats.originalBytes,
    finalBytes: stats.finalBytes,
    savedBytes: stats.savedBytes,
    averageCompressionRatio: stats.originalBytes > 0 ? stats.savedBytes / stats.originalBytes : 0,
    startedAt: new Date(stats.startedAt).toISOString(),
    finishedAt: new Date(stats.finishedAt ?? Date.now()).toISOString(),
    files: stats.results
  };

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await logger.info(`JSON report saved: ${reportPath}`);
  return reportPath;
}
