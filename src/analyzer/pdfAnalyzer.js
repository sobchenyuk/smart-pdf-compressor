import fs from 'node:fs';
import fsp from 'node:fs/promises';

const imageObjectStreamPattern = /\d+\s+\d+\s+obj\s*<<([\s\S]*?\/Subtype\s*\/Image[\s\S]*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
const imageDictionaryPattern = /<<[\s\S]*?\/Subtype\s*\/Image[\s\S]*?>>/g;
const streamPattern = /<<([\s\S]*?)>>\s*stream/g;

export async function analyzePdf(filePath, { logger, config }) {
  const stat = await fsp.stat(filePath);
  const readLimit = Math.max(1, config.performance.analysisReadLimitMB) * 1024 * 1024;
  const buffer = await readForAnalysis(filePath, Math.min(stat.size, readLimit));
  const raw = buffer.toString('latin1');
  const structure = analyzeStructure(raw);
  const document = await analyzeWithPdfjs(filePath, stat.size <= readLimit ? buffer : null, logger);
  const summary = buildSummary({ fileSize: stat.size, structure, document, truncated: stat.size > readLimit });
  const classification = classify(summary, config);

  return {
    fileSize: stat.size,
    mode: classification.mode,
    isAlreadyOptimized: classification.isAlreadyOptimized,
    predictedSavingPercent: classification.predictedSavingPercent,
    summary
  };
}

async function readForAnalysis(filePath, bytesToRead) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function analyzeStructure(raw) {
  const images = [];
  for (const match of raw.matchAll(imageObjectStreamPattern)) {
    images.push(parseImageDictionary(match[1], Buffer.byteLength(match[2], 'latin1')));
  }
  if (images.length === 0) {
    for (const match of raw.matchAll(imageDictionaryPattern)) {
      const dictionary = match[0];
      images.push(parseImageDictionary(dictionary, readNumber(dictionary, 'Length') ?? 0));
    }
  }

  const streams = Array.from(raw.matchAll(streamPattern), (match) => match[1]);
  const compressedStreams = streams.filter((dictionary) => /\/Filter\b/.test(dictionary)).length;

  return {
    images,
    streamCount: streams.length,
    compressedStreams,
    compressedStreamRatio: streams.length ? compressedStreams / streams.length : 0,
    fontBytes: estimateEmbeddedFontBytes(raw),
    hasObjectStreams: /\/ObjStm\b/.test(raw),
    hasXrefStream: /\/Type\s*\/XRef\b/.test(raw)
  };
}

async function analyzeWithPdfjs(filePath, buffer, logger) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = buffer ? new Uint8Array(buffer) : new Uint8Array(await streamToBuffer(filePath, 128 * 1024 * 1024));
    const loadingTask = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: true, verbosity: 0 });
    const pdf = await loadingTask.promise;
    let textItems = 0;
    let textChars = 0;
    const pageViewports = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pageViewports.push({ widthPoints: viewport.width, heightPoints: viewport.height });
      const content = await page.getTextContent({ disableCombineTextItems: false });
      textItems += content.items.length;
      textChars += content.items.reduce((sum, item) => sum + (item.str?.trim().length ?? 0), 0);
      page.cleanup();
    }

    await pdf.destroy();
    return { pageCount: pdf.numPages, textItems, textChars, pageViewports };
  } catch (error) {
    await logger.warn(`pdfjs analysis fallback for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return { pageCount: 0, textItems: 0, textChars: 0, pageViewports: [] };
  }
}

function buildSummary({ fileSize, structure, document, truncated }) {
  const imageBytes = structure.images.reduce((sum, image) => sum + image.encodedLength, 0);
  const rawImageBytes = structure.images.reduce((sum, image) => sum + image.estimatedRawBytes, 0);
  const largeImages = structure.images.filter((image) => image.megapixels >= 1.5 || image.encodedLength >= 1_000_000);
  const jpegImages = structure.images.filter((image) => image.isJpeg || image.isJpx).length;
  const pngLikeImages = structure.images.filter((image) => image.isFlate).length;
  const maxDpi = estimateMaxDpi(structure.images, document.pageViewports);
  const imageByteRatio = fileSize ? imageBytes / fileSize : 0;
  const fontByteRatio = fileSize ? structure.fontBytes / fileSize : 0;
  const textDensity = document.pageCount ? document.textChars / document.pageCount : 0;
  const textPercentage = estimateTextPercentage(textDensity, imageByteRatio);
  const scanLikelihood = document.pageCount > 0 && structure.images.length >= document.pageCount && imageByteRatio > 0.35 && textDensity < 120;
  const textOnlyLikelihood = textDensity > 350 && imageByteRatio < 0.25 && structure.images.length <= document.pageCount;
  const alreadyOptimizedSignals = [
    structure.compressedStreamRatio > 0.7,
    structure.hasObjectStreams || structure.hasXrefStream,
    jpegImages >= structure.images.length * 0.75,
    imageByteRatio < 0.25,
    maxDpi < 180 || !Number.isFinite(maxDpi)
  ].filter(Boolean).length;

  return {
    pageCount: document.pageCount,
    fileSize,
    truncatedAnalysis: truncated,
    imageCount: structure.images.length,
    largeImageCount: largeImages.length,
    jpegImages,
    pngLikeImages,
    maxImageWidth: Math.max(0, ...structure.images.map((image) => image.width ?? 0)),
    maxImageHeight: Math.max(0, ...structure.images.map((image) => image.height ?? 0)),
    maxDpi: Number.isFinite(maxDpi) ? Math.round(maxDpi) : null,
    imageBytes,
    rawImageBytes,
    imageByteRatio,
    embeddedFontBytes: structure.fontBytes,
    fontByteRatio,
    streamCount: structure.streamCount,
    compressedStreams: structure.compressedStreams,
    compressedStreamRatio: structure.compressedStreamRatio,
    textChars: document.textChars,
    textItems: document.textItems,
    textDensity,
    textPercentage,
    textOnlyLikelihood,
    scanLikelihood,
    alreadyOptimizedSignals
  };
}

function classify(summary, config) {
  let predictedSavingPercent = 0;
  let mode = 'light';

  if (summary.scanLikelihood || (summary.largeImageCount >= Math.max(1, summary.pageCount * 0.6) && summary.imageByteRatio > 0.4)) {
    mode = config.compression.aggressiveScanCompression ? 'aggressive' : 'medium';
    predictedSavingPercent = estimateImageSavings(summary, 0.45) + estimateFontSavings(summary);
  } else if (summary.imageByteRatio > 0.3 || summary.largeImageCount > 0 || summary.pngLikeImages > summary.jpegImages) {
    mode = 'medium';
    predictedSavingPercent = estimateImageSavings(summary, 0.3) + estimateFontSavings(summary);
  } else {
    mode = 'light';
    predictedSavingPercent = Math.min(12, estimateFontSavings(summary) + (summary.compressedStreamRatio < 0.5 ? 6 : 2));
  }

  if (summary.textOnlyLikelihood) {
    mode = 'light';
    predictedSavingPercent = Math.min(predictedSavingPercent, 12);
  }
  if (summary.alreadyOptimizedSignals >= 4) predictedSavingPercent *= 0.55;
  predictedSavingPercent = Math.max(0, Math.min(85, predictedSavingPercent));

  return {
    mode,
    predictedSavingPercent,
    isAlreadyOptimized: config.compression.skipOptimized && predictedSavingPercent < config.compression.minEstimatedReductionPercent
  };
}

function parseImageDictionary(dictionary, encodedLength) {
  const width = readNumber(dictionary, 'Width');
  const height = readNumber(dictionary, 'Height');
  const bitsPerComponent = readNumber(dictionary, 'BitsPerComponent') ?? 8;
  const colors = inferColorComponents(dictionary);
  const filterNames = readNames(dictionary, 'Filter');
  const estimatedRawBytes = width && height ? Math.round(width * height * colors * (bitsPerComponent / 8)) : 0;
  const megapixels = width && height ? (width * height) / 1_000_000 : 0;
  return { width, height, bitsPerComponent, colors, encodedLength, estimatedRawBytes, megapixels, filters: filterNames, isJpeg: filterNames.includes('DCTDecode'), isJpx: filterNames.includes('JPXDecode'), isFlate: filterNames.includes('FlateDecode') };
}

function estimateImageSavings(summary, expectedImageReduction) {
  return summary.imageByteRatio * expectedImageReduction * 100;
}

function estimateFontSavings(summary) {
  return Math.min(8, summary.fontByteRatio * 20);
}

function estimateTextPercentage(textDensity, imageByteRatio) {
  const textScore = Math.min(1, textDensity / 1000);
  const imagePenalty = Math.min(1, imageByteRatio);
  return Math.max(0, Math.min(100, Math.round((textScore * (1 - imagePenalty)) * 100)));
}

function estimateMaxDpi(images, viewports) {
  if (!viewports.length || !images.length) return Number.NaN;
  let max = Number.NaN;
  for (const image of images) {
    if (!image.width || !image.height) continue;
    for (const viewport of viewports) {
      const dpiX = image.width / (viewport.widthPoints / 72);
      const dpiY = image.height / (viewport.heightPoints / 72);
      const dpi = Math.max(dpiX, dpiY);
      if (!Number.isFinite(max) || dpi > max) max = dpi;
    }
  }
  return max;
}

function inferColorComponents(dictionary) {
  if (/\/DeviceCMYK\b/.test(dictionary)) return 4;
  if (/\/DeviceGray\b/.test(dictionary) || /\/Indexed\b/.test(dictionary)) return 1;
  return 3;
}

function estimateEmbeddedFontBytes(raw) {
  let total = 0;
  for (const match of raw.matchAll(/\/FontFile[23]?\s+(\d+)\s+(\d+)\s+R/g)) {
    const objectPattern = new RegExp(`${match[1]}\\s+${match[2]}\\s+obj\\s*<<([\\s\\S]*?)>>`, 'm');
    const objectMatch = raw.match(objectPattern);
    if (objectMatch) total += readNumber(objectMatch[1], 'Length') ?? 0;
  }
  return total;
}

function readNumber(dictionary, key) {
  const match = dictionary.match(new RegExp(`/${key}\\s+(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function readNames(dictionary, key) {
  const direct = dictionary.match(new RegExp(`/${key}\\s*/([A-Za-z0-9]+)`));
  const array = dictionary.match(new RegExp(`/${key}\\s*\\[([^\\]]+)\\]`));
  if (array) return Array.from(array[1].matchAll(/\/([A-Za-z0-9]+)/g), (match) => match[1]);
  return direct ? [direct[1]] : [];
}

async function streamToBuffer(filePath, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('file too large for full pdfjs analysis');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
