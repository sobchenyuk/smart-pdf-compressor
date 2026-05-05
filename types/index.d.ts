import type { SmartPdfConfig, RuntimeCliOptions, LoadedConfig, CompressionMode } from './config.js';

export type {
  CompressionMode,
  CompressionProfile,
  ConflictMode,
  LoadedConfig,
  LogLevel,
  RuntimeCliOptions,
  SmartPdfConfig
} from './config.js';

export interface PdfAnalysisSummary {
  pageCount: number;
  fileSize: number;
  truncatedAnalysis: boolean;
  imageCount: number;
  largeImageCount: number;
  jpegImages: number;
  pngLikeImages: number;
  maxImageWidth: number;
  maxImageHeight: number;
  maxDpi: number | null;
  imageBytes: number;
  rawImageBytes: number;
  imageByteRatio: number;
  embeddedFontBytes: number;
  fontByteRatio: number;
  streamCount: number;
  compressedStreams: number;
  compressedStreamRatio: number;
  textChars: number;
  textItems: number;
  textDensity: number;
  textPercentage: number;
  textOnlyLikelihood: boolean;
  scanLikelihood: boolean;
  alreadyOptimizedSignals: number;
}

export interface PdfAnalysisResult {
  fileSize: number;
  mode: CompressionMode;
  isAlreadyOptimized: boolean;
  predictedSavingPercent: number;
  summary: PdfAnalysisSummary;
}

export interface LoggerLike {
  debug(message: string): unknown | Promise<unknown>;
  info(message: string): unknown | Promise<unknown>;
  warn(message: string): unknown | Promise<unknown>;
  error(message: string): unknown | Promise<unknown>;
}

export interface GhostscriptCheckResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface CompressPdfOptions {
  inputPath: string;
  outputPath: string;
  mode: CompressionMode;
  config: SmartPdfConfig;
}

export interface CompressPdfResult {
  size: number;
}

export interface ScanFileResult {
  absolutePath: string;
  relativePath: string;
  isPdf: boolean;
  size: number;
  mtime: Date;
}

export interface CopyFileStreamOptions {
  sourcePath: string;
  outputPath: string;
  onConflict?: SmartPdfConfig['copyAll']['onConflict'];
  preserveTimestamps?: boolean;
}

export interface CopyFileStreamResult {
  status: 'copied' | 'skipped';
  outputPath: string;
  bytes: number;
  reason?: string;
}

export const defaultConfig: SmartPdfConfig;
export const configFileName: string;

export function analyzePdf(filePath: string, options: { logger: LoggerLike; config: SmartPdfConfig }): Promise<PdfAnalysisResult>;
export function checkGhostscript(binary?: string): Promise<GhostscriptCheckResult>;
export function ensureGhostscript(binary?: string): Promise<GhostscriptCheckResult>;
export function compressPdf(options: CompressPdfOptions): Promise<CompressPdfResult>;
export function loadConfig(options: { cwd: string; cliOptions?: RuntimeCliOptions }): Promise<LoadedConfig>;
export function writeDefaultConfig(cwd: string, options?: { overwrite?: boolean }): Promise<string>;
export function resetConfig(cwd: string): Promise<string>;
export function validateConfig(config: SmartPdfConfig): void;
export function copyFileStream(options: CopyFileStreamOptions): Promise<CopyFileStreamResult>;
export function scanFiles(inputFolder: string, outputFolder: string, options?: { includeNonPdf?: boolean }): Promise<ScanFileResult[]>;
export function ensureSafeFolders(inputFolder: string, outputFolder: string, options?: { safeMode?: boolean }): Promise<void>;
