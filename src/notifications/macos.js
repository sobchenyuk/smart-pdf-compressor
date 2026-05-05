import { spawn } from 'node:child_process';

export class NotificationCenter {
  constructor(config) {
    this.config = config;
    this.lastByKey = new Map();
    this.throttleMs = 30000;
    this.errorCount = 0;
  }

  async success(message) {
    if (this.config.enabled && this.config.success) await this.send('Compression complete', message, 'success');
  }

  async error(message) {
    this.errorCount += 1;
    if (this.config.enabled && this.config.errors && this.errorCount === 1) {
      await this.send('Processing failed', message || 'Check logs for details.', 'error');
    }
  }

  async warning(title, message) {
    if (this.config.enabled && this.config.warnings) await this.send(title, message, `warning:${title}`);
  }

  async flushErrors() {
    if (!this.config.enabled || !this.config.errors || this.errorCount <= 1) return;
    await this.send('Multiple processing errors', `${this.errorCount} files failed.`, 'error-summary', { force: true });
  }

  async send(title, message, key, { force = false } = {}) {
    if (process.platform !== 'darwin') return;
    const now = Date.now();
    const last = this.lastByKey.get(key) ?? 0;
    if (!force && now - last < this.throttleMs) return;
    this.lastByKey.set(key, now);

    await new Promise((resolve) => {
      const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} subtitle ${JSON.stringify('Smart PDF Compressor')}`;
      const child = spawn('osascript', ['-e', script], { stdio: 'ignore' });
      child.on('close', resolve);
      child.on('error', resolve);
    });
  }
}
