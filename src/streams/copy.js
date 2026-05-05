import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ensureDirectory, removeFileQuietly } from '../utils/fs.js';

export async function copyFileStream({ sourcePath, outputPath, onConflict = 'skip', preserveTimestamps = true }) {
  const destination = await resolveOutputPath(outputPath, onConflict);
  if (!destination) return { status: 'skipped', outputPath, bytes: 0, reason: 'output exists' };

  await ensureDirectory(path.dirname(destination));
  const tempPath = `${destination}.partial-${process.pid}-${Date.now()}`;

  try {
    await pipeline(
      fs.createReadStream(sourcePath),
      fs.createWriteStream(tempPath, { flags: 'wx' })
    );
    await fsp.rename(tempPath, destination);
    if (preserveTimestamps) {
      const stat = await fsp.stat(sourcePath);
      await fsp.utimes(destination, stat.atime, stat.mtime);
    }
    const stat = await fsp.stat(destination);
    return { status: 'copied', outputPath: destination, bytes: stat.size };
  } catch (error) {
    await removeFileQuietly(tempPath);
    throw error;
  }
}

export async function resolveOutputPath(outputPath, onConflict) {
  const exists = await fileExists(outputPath);
  if (!exists) return outputPath;
  if (onConflict === 'skip') return null;
  if (onConflict === 'overwrite') return outputPath;
  if (onConflict === 'rename') return nextAvailableName(outputPath);
  throw new Error(`Unsupported conflict mode: ${onConflict}`);
}

async function nextAvailableName(outputPath) {
  const directory = path.dirname(outputPath);
  const extension = path.extname(outputPath);
  const base = path.basename(outputPath, extension);
  for (let index = 1; index < 10000; index += 1) {
    const candidate = path.join(directory, `${base} (${index})${extension}`);
    if (!await fileExists(candidate)) return candidate;
  }
  throw new Error(`Could not find available filename for ${outputPath}`);
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
