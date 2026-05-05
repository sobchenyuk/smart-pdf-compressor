import readline from 'node:readline';
import { formatBytes, formatDuration } from '../utils/format.js';

export class Dashboard {
  constructor({ enabled, refreshMs }) {
    this.enabled = enabled;
    this.refreshMs = refreshMs;
    this.timer = null;
    this.stats = null;
  }

  start(stats) {
    this.stats = stats;
    if (!this.enabled) return;
    this.render();
    this.timer = setInterval(() => this.render(), this.refreshMs);
  }

  update(stats) {
    this.stats = stats;
  }

  stop(renderFinal = false) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.enabled && renderFinal) this.render();
    if (this.enabled) process.stdout.write('\n');
  }

  render() {
    if (!this.enabled || !this.stats) return;
    const stats = this.stats;
    const elapsedMs = Date.now() - stats.startedAt;
    const processed = stats.processedPdf + stats.copiedFiles + stats.failed;
    const percent = stats.totalFiles > 0 ? (processed / stats.totalFiles) * 100 : 100;
    const speed = elapsedMs > 0 ? processed / (elapsedMs / 1000) : 0;
    const remaining = Math.max(0, stats.totalFiles - processed);
    const etaMs = speed > 0 ? (remaining / speed) * 1000 : Number.NaN;

    const lines = [
      'Smart PDF Compressor',
      `Progress: ${processed}/${stats.totalFiles} (${percent.toFixed(1)}%)`,
      `PDF compressed: ${stats.compressedPdf}  PDF skipped: ${stats.skippedPdf}  Copied: ${stats.copiedFiles}  Failed: ${stats.failed}`,
      `Current: ${stats.currentFile || '-'}`,
      `Saved: ${formatBytes(stats.savedBytes)}  Original: ${formatBytes(stats.originalBytes)}  Final: ${formatBytes(stats.finalBytes)}`,
      `Elapsed: ${formatDuration(elapsedMs)}  ETA: ${formatDuration(etaMs)}  Speed: ${speed.toFixed(2)} files/s`
    ];

    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    process.stdout.write(lines.join('\n'));
  }
}
