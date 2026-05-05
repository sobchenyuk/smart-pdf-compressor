import fs from 'node:fs/promises';
import path from 'node:path';

export async function scanFiles(inputFolder, outputFolder, { includeNonPdf = false } = {}) {
  const files = [];
  await walk(inputFolder, inputFolder, path.resolve(outputFolder), includeNonPdf, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

async function walk(currentDir, rootDir, outputFolder, includeNonPdf, files) {
  if (isInsideOutput(currentDir, outputFolder)) return;

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, rootDir, outputFolder, includeNonPdf, files);
      continue;
    }
    if (!entry.isFile()) continue;

    const isPdf = entry.name.toLowerCase().endsWith('.pdf');
    if (!isPdf && !includeNonPdf) continue;

    const stat = await fs.stat(absolutePath);
    files.push({
      absolutePath,
      relativePath: path.relative(rootDir, absolutePath),
      isPdf,
      size: stat.size,
      mtime: stat.mtime
    });
  }
}

function isInsideOutput(currentDir, outputFolder) {
  const current = path.resolve(currentDir);
  const output = path.resolve(outputFolder);
  const relative = path.relative(output, current);
  return current === output || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}
