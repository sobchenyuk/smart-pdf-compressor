import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkGhostscript } from '../compressor/ghostscript.js';
import { hasReadAccess, hasWriteAccess } from '../utils/fs.js';
import { formatBytes } from '../utils/format.js';

export async function runDoctor({ config, cwd }) {
  const checks = [];
  const gs = await checkGhostscript(config.ghostscript.binary);
  checks.push({
    name: 'Ghostscript installation',
    ok: gs.ok,
    detail: gs.ok ? `version ${gs.version}` : 'Ghostscript not found.'
  });

  checks.push({
    name: 'PATH access',
    ok: gs.ok,
    detail: gs.ok ? `${config.ghostscript.binary} is executable` : `Command not available: ${config.ghostscript.binary}`
  });

  try {
    await hasReadAccess(cwd);
    await hasWriteAccess(cwd);
    checks.push({ name: 'Filesystem permissions', ok: true, detail: `read/write OK: ${cwd}` });
  } catch (error) {
    checks.push({ name: 'Filesystem permissions', ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const stats = await fs.statfs(cwd);
    const availableBytes = stats.bavail * stats.bsize;
    checks.push({
      name: 'Available disk space',
      ok: availableBytes > config.safety.lowDiskSpaceWarningMB * 1024 * 1024,
      detail: `${formatBytes(availableBytes)} available on ${cwd}`
    });
  } catch {
    checks.push({ name: 'Available disk space', ok: true, detail: `statfs unavailable on ${os.platform()}, skipped` });
  }

  console.log('Smart PDF Compressor doctor\n');
  for (const check of checks) {
    console.log(`${check.ok ? 'OK' : 'FAIL'}  ${check.name}: ${check.detail}`);
  }

  const ok = checks.every((check) => check.ok);
  if (!ok) {
    console.log('\nERROR:\nGhostscript not found.\n\nInstall with:\n\nbrew install ghostscript');
    process.exitCode = 1;
  }
}

export async function warnIfLowDisk({ config, outputFolder, logger, notifications }) {
  try {
    const stats = await fs.statfs(path.resolve(outputFolder, '..'));
    const availableBytes = stats.bavail * stats.bsize;
    const thresholdBytes = config.safety.lowDiskSpaceWarningMB * 1024 * 1024;
    if (availableBytes < thresholdBytes) {
      const message = `Only ${formatBytes(availableBytes)} available near output folder.`;
      await logger.warn(`Low disk space: ${message}`);
      await notifications.warning('Low disk space', message);
    }
  } catch {
    await logger.debug('Disk space check skipped.');
  }
}
