import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePdf } from '../analyzer/pdfAnalyzer.js';
import { compressPdf, ensureGhostscript } from '../compressor/ghostscript.js';
import { parseArgs, usage } from './args.js';
import { runDoctor, warnIfLowDisk } from './doctor.js';
import { loadConfig, resetConfig, writeDefaultConfig } from '../config/index.js';
import { createLogger } from '../logger/logger.js';
import { Dashboard } from '../logger/dashboard.js';
import { NotificationCenter } from '../notifications/macos.js';
import { writeReports } from '../reports/reportWriter.js';
import { copyFileStream, resolveOutputPath } from '../streams/copy.js';
import { LargeFileLimiter } from '../workers/largeFileLimiter.js';
import { createQueue } from '../workers/queue.js';
import { scanFiles } from '../utils/fileScanner.js';
import { ensureDirectory, ensureSafeFolders, getFileSize, removeFileQuietly } from '../utils/fs.js';
import { formatBytes, formatDuration } from '../utils/format.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runCli(argv) {
  const parsed = parseArgs(argv);
  const cwd = process.cwd();

  if (parsed.options.help) {
    console.log(usage());
    return;
  }
  if (parsed.options.version) {
    const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    console.log(pkg.version);
    return;
  }

  const { config } = await loadConfig({ cwd, cliOptions: parsed.options });

  if (parsed.command === 'init') {
    const configPath = await writeDefaultConfig(cwd);
    console.log(`Created ${configPath}`);
    return;
  }

  if (parsed.command === 'config') {
    if (parsed.subcommand === 'show') {
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    if (parsed.subcommand === 'reset') {
      const configPath = await resetConfig(cwd);
      console.log(`Reset ${configPath}`);
      return;
    }
    throw new Error('Unknown config command. Use: spdf config show | spdf config reset');
  }

  if (parsed.options.doctor) {
    await runDoctor({ config, cwd });
    return;
  }

  const inputFolder = parsed.positional[0] ? path.resolve(parsed.positional[0]) : null;
  const outputFolder = parsed.positional[1] ? path.resolve(parsed.positional[1]) : null;
  if (!inputFolder || !outputFolder) {
    throw new Error(`${usage()}\n\nMissing input-folder or output-folder.`);
  }

  await processFolders({ inputFolder, outputFolder, config, options: parsed.options });
}

async function processFolders({ inputFolder, outputFolder, config, options }) {
  await ensureSafeFolders(inputFolder, outputFolder, { safeMode: config.safety.safeMode });
  await ensureDirectory(outputFolder);

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const metadataDir = path.join(outputFolder, '.smart-pdf-compressor');
  const logDir = path.join(metadataDir, 'logs');
  const recoveryMarkerPath = path.join(metadataDir, 'session.lock');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-pdf-compressor-'));
  await ensureDirectory(metadataDir);
  const logger = await createLogger({
    logDir,
    level: config.logging.logLevel,
    consoleEnabled: !process.stdout.isTTY,
    saveLogs: config.logging.saveLogs
  });
  const notifications = new NotificationCenter(config.notifications);
  const dashboard = new Dashboard({ enabled: process.stdout.isTTY, refreshMs: config.logging.dashboardRefreshMs });

  const cleanup = async () => {
    dashboard.stop();
    await logger.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  };

  process.once('SIGINT', async () => {
    await logger.error('Interrupted by SIGINT.');
    await notifications.error('Processing interrupted.');
    await cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', async () => {
    await logger.error('Interrupted by SIGTERM.');
    await notifications.error('Processing terminated.');
    await cleanup();
    process.exit(143);
  });

  try {
    const previousSession = await readRecoveryMarker(recoveryMarkerPath);
    if (previousSession) {
      await logger.warn(`Recovery warning: previous session did not finish cleanly (${previousSession}).`);
      await notifications.warning('Recovery warning', 'Previous session did not finish cleanly. Check logs.');
    }
    await fs.writeFile(recoveryMarkerPath, JSON.stringify({ runId, startedAt: new Date().toISOString(), inputFolder, outputFolder }, null, 2), 'utf8');
    await logger.info(`Run started: ${runId}`);
    await logger.info(`Input: ${inputFolder}`);
    await logger.info(`Output: ${outputFolder}`);
    await logger.info(`Temp: ${tempDir}`);
    if (options.dryRun) await logger.warn('Dry-run mode: no files will be written.');
    if (!options.dryRun) await ensureGhostscript(config.ghostscript.binary);
    await warnIfLowDisk({ config, outputFolder, logger, notifications });

    const files = await scanFiles(inputFolder, outputFolder, { includeNonPdf: config.copyAll.enabled });
    const stats = createStats(files.length);
    const largeFileLimiter = new LargeFileLimiter(config.performance.maxConcurrentLargeFiles);
    dashboard.start(stats);
    await logger.info(`Found ${files.length} file(s). PDF pipeline: ${files.filter((file) => file.isPdf).length}.`);

    const queue = createQueue({
      items: files,
      concurrency: config.workers.maxWorkers,
      retries: config.workers.retryCount,
      logger,
      onAttempt: (file) => {
        stats.currentFile = file.relativePath;
        dashboard.update(stats);
      },
      onFailure: async (file, message) => {
        stats.failed += 1;
        stats.originalBytes += file.size ?? await getFileSize(file.absolutePath).catch(() => 0);
        stats.finalBytes += file.size ?? 0;
        stats.results.push({ file: file.relativePath, type: file.isPdf ? 'pdf' : 'file', status: 'failed', reason: message });
        await notifications.error(`${file.relativePath}: ${message}`);
      },
      worker: async (file, attempt) => {
        if (file.isPdf) {
          await processPdf({ file, attempt, outputFolder, tempDir, config, options, logger, stats, notifications, largeFileLimiter });
        } else {
          await processCopy({ file, outputFolder, config, options, logger, stats });
        }
      }
    });

    await queue.run();
    stats.finishedAt = Date.now();
    dashboard.stop(true);
    const reportPath = await writeReports({ outputFolder, stats, logger, enabled: config.reports.generateJsonReport });
    printSummary(stats, reportPath);
    await notifications.flushErrors();
    await fs.rm(recoveryMarkerPath, { force: true });
    if (stats.failed > 0) {
      await notifications.error('Check logs for details.');
    } else {
      await notifications.success(`${stats.processedPdf + stats.copiedFiles} files processed\n${formatBytes(stats.savedBytes)} saved\n${formatDuration(Date.now() - stats.startedAt)}`);
    }
  } catch (error) {
    await notifications.error('Check logs for details.');
    throw error;
  } finally {
    await cleanup();
  }
}

async function processPdf(context) {
  const fileSize = context.file.size ?? await getFileSize(context.file.absolutePath);
  const isLarge = fileSize >= context.config.performance.largeFileThresholdMB * 1024 * 1024;
  if (isLarge) await context.largeFileLimiter.acquire();
  try {
    return await processPdfInner(context);
  } finally {
    if (isLarge) context.largeFileLimiter.release();
  }
}

async function processPdfInner({ file, attempt, outputFolder, tempDir, config, options, logger, stats, notifications }) {
  let outputPath = path.join(outputFolder, file.relativePath);
  const tempOutput = path.join(tempDir, `${Buffer.from(file.relativePath).toString('base64url').slice(0, 120)}.${Date.now()}.pdf`);
  const analysis = await analyzePdf(file.absolutePath, { logger, config });
  const originalSize = analysis.fileSize;

  if (originalSize >= config.performance.largeFileThresholdMB * 1024 * 1024) {
    await notifications.warning('Large file detected', `${file.relativePath}\n${formatBytes(originalSize)}`);
  }

  if (analysis.isAlreadyOptimized) {
    stats.processedPdf += 1;
    stats.skippedPdf += 1;
    stats.originalBytes += originalSize;
    stats.finalBytes += originalSize;
    stats.results.push(makePdfResult(file, 'skipped', originalSize, originalSize, analysis, 'skip: already optimized'));
    await logger.info(`${file.relativePath}: skip: already optimized`);
    return;
  }

  if (options.dryRun) {
    stats.processedPdf += 1;
    stats.skippedPdf += 1;
    stats.originalBytes += originalSize;
    stats.finalBytes += originalSize;
    stats.results.push(makePdfResult(file, 'dry-run', originalSize, originalSize, analysis, `would use ${analysis.mode}`));
    await logger.info(`${file.relativePath}: dry-run: would use ${analysis.mode}`);
    return;
  }

  const resolvedOutputPath = await resolveOutputPath(outputPath, config.copyAll.onConflict);
  if (!resolvedOutputPath) {
    stats.processedPdf += 1;
    stats.skippedPdf += 1;
    stats.originalBytes += originalSize;
    stats.finalBytes += originalSize;
    stats.results.push(makePdfResult(file, 'skipped', originalSize, originalSize, analysis, 'output exists'));
    await logger.warn(`${file.relativePath}: output exists, skipped`);
    return;
  }
  outputPath = resolvedOutputPath;

  await ensureDirectory(path.dirname(outputPath));
  const compressed = await compressPdf({ inputPath: file.absolutePath, outputPath: tempOutput, mode: analysis.mode, config });
  const compressedSize = compressed.size;
  const savedPercent = originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;

  if (compressedSize <= 0 || savedPercent < config.compression.minSavingsPercent) {
    await removeFileQuietly(tempOutput);
    stats.processedPdf += 1;
    stats.skippedPdf += 1;
    stats.originalBytes += originalSize;
    stats.finalBytes += originalSize;
    stats.results.push(makePdfResult(file, 'skipped', originalSize, originalSize, analysis, 'compression not effective'));
    await logger.warn(`${file.relativePath}: compression not effective`);
    return;
  }

  await fs.rename(tempOutput, outputPath);
  stats.processedPdf += 1;
  stats.compressedPdf += 1;
  stats.originalBytes += originalSize;
  stats.finalBytes += compressedSize;
  stats.savedBytes += originalSize - compressedSize;
  stats.results.push(makePdfResult(file, 'compressed', originalSize, compressedSize, analysis, `compressed with ${analysis.mode}`));
  await logger.info(`${file.relativePath}: compressed ${formatBytes(originalSize)} -> ${formatBytes(compressedSize)} (${savedPercent.toFixed(1)}% saved, attempt ${attempt}).`);
}

async function processCopy({ file, outputFolder, config, options, logger, stats }) {
  if (!config.copyAll.enabled) return;
  const originalSize = file.size ?? await getFileSize(file.absolutePath);
  if (options.dryRun) {
    stats.copiedFiles += 1;
    stats.originalBytes += originalSize;
    stats.finalBytes += originalSize;
    stats.results.push({ file: file.relativePath, type: 'file', status: 'dry-run', originalBytes: originalSize, finalBytes: originalSize });
    await logger.info(`${file.relativePath}: dry-run: would copy`);
    return;
  }

  const result = await copyFileStream({
    sourcePath: file.absolutePath,
    outputPath: path.join(outputFolder, file.relativePath),
    onConflict: config.copyAll.onConflict,
    preserveTimestamps: config.copyAll.preserveTimestamps
  });

  stats.copiedFiles += result.status === 'copied' ? 1 : 0;
  stats.skippedFiles += result.status === 'skipped' ? 1 : 0;
  stats.originalBytes += originalSize;
  stats.finalBytes += result.status === 'copied' ? result.bytes : originalSize;
  stats.results.push({ file: file.relativePath, type: 'file', status: result.status, originalBytes: originalSize, finalBytes: result.bytes });
  await logger.info(`${file.relativePath}: ${result.status}`);
}

function createStats(totalFiles) {
  return {
    totalFiles,
    processedPdf: 0,
    compressedPdf: 0,
    skippedPdf: 0,
    copiedFiles: 0,
    skippedFiles: 0,
    failed: 0,
    originalBytes: 0,
    finalBytes: 0,
    savedBytes: 0,
    startedAt: Date.now(),
    finishedAt: null,
    currentFile: '',
    results: []
  };
}

function makePdfResult(file, status, originalBytes, finalBytes, analysis, reason) {
  return {
    file: file.relativePath,
    type: 'pdf',
    status,
    reason,
    mode: analysis.mode,
    originalBytes,
    finalBytes,
    savedBytes: Math.max(0, originalBytes - finalBytes),
    analysis: analysis.summary
  };
}

function printSummary(stats, reportPath) {
  const ratio = stats.originalBytes > 0 ? (stats.savedBytes / stats.originalBytes) * 100 : 0;
  console.log('\nSummary report');
  console.log(`Total files: ${stats.totalFiles}`);
  console.log(`Compressed files: ${stats.compressedPdf}`);
  console.log(`Skipped PDF files: ${stats.skippedPdf}`);
  console.log(`Copied files: ${stats.copiedFiles}`);
  console.log(`Failed files: ${stats.failed}`);
  console.log(`Original total size: ${formatBytes(stats.originalBytes)}`);
  console.log(`Final total size: ${formatBytes(stats.finalBytes)}`);
  console.log(`Total saved space: ${formatBytes(stats.savedBytes)}`);
  console.log(`Average compression ratio: ${ratio.toFixed(1)}%`);
  if (reportPath) console.log(`JSON report: ${reportPath}`);
}

async function readRecoveryMarker(markerPath) {
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
    return marker.startedAt || marker.runId || 'unknown session';
  } catch {
    return null;
  }
}
