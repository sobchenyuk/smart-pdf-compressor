import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
}

export async function removeFileQuietly(filePath) {
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // Cleanup must never hide the original error path.
  }
}

export async function ensureSafeFolders(inputFolder, outputFolder, { safeMode = true } = {}) {
  const input = await realpathOrResolve(inputFolder);
  const output = path.resolve(outputFolder);
  const inputStat = await fs.stat(input).catch(() => null);

  if (!inputStat?.isDirectory()) {
    throw new Error(`Input folder does not exist or is not a directory: ${inputFolder}`);
  }

  if (!safeMode) return;

  const outputReal = await realpathOrResolve(output);
  if (samePath(input, outputReal) || samePath(input, output)) {
    throw new Error('Input and output folders must be different.');
  }

  if (isSubPath(input, outputReal) || isSubPath(input, output)) {
    throw new Error('Output folder must not be inside input folder.');
  }
}

export async function getFileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

export async function hasWriteAccess(directory) {
  await ensureDirectory(directory);
  const probe = path.join(directory, `.spdf-write-test-${Date.now()}`);
  await fs.writeFile(probe, 'ok');
  await fs.rm(probe, { force: true });
}

export async function hasReadAccess(directory) {
  await fs.access(directory);
}

async function realpathOrResolve(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function samePath(left, right) {
  return normalize(left) === normalize(right);
}

function isSubPath(parent, child) {
  const relative = path.relative(normalize(parent), normalize(child));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalize(filePath) {
  return path.resolve(filePath).replace(/[\\/]+$/, '');
}
