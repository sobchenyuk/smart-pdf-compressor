import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

export async function checkGhostscript(binary = 'gs') {
  try {
    const result = await run(binary, ['--version'], { timeoutMs: 10000 });
    return { ok: true, version: result.stdout.trim() || result.stderr.trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function ensureGhostscript(binary = 'gs') {
  const result = await checkGhostscript(binary);
  if (!result.ok) {
    throw new Error('Ghostscript not found.\n\nInstall with:\n\nbrew install ghostscript');
  }
  return result;
}

export async function compressPdf({ inputPath, outputPath, mode, config }) {
  const profile = config.compression.profiles[mode] ?? config.compression.profiles.medium;
  const args = buildArgs({ inputPath, outputPath, profile });
  await run(config.ghostscript.binary, args, { timeoutMs: config.ghostscript.timeoutMs });
  const outputStat = await stat(outputPath);
  return { size: outputStat.size };
}

function buildArgs({ inputPath, outputPath, profile }) {
  return [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    `-dPDFSETTINGS=${profile.pdfSettings}`,
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-dSAFER',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    '-dAutoRotatePages=/None',
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dMonoImageDownsampleType=/Subsample',
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dDownsampleMonoImages=true',
    `-dColorImageResolution=${profile.colorImageResolution}`,
    `-dGrayImageResolution=${profile.grayImageResolution}`,
    `-dMonoImageResolution=${profile.monoImageResolution}`,
    `-dJPEGQ=${profile.jpegQuality}`,
    `-sOutputFile=${outputPath}`,
    inputPath
  ];
}

function run(command, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      if (error.code === 'ENOENT') reject(new Error('Ghostscript not found.'));
      else reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`.trim()));
    });
  });
}
