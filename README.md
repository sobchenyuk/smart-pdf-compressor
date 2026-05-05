# Smart PDF Compressor

Smart PDF Compressor is a production-oriented macOS CLI for rule-based PDF compression across large directory trees.

It does not compress PDF files blindly. Each PDF is analyzed first, classified, processed with an appropriate Ghostscript profile, and validated after compression. Original input files are never modified.

> WARNING:
>
> This package will NOT work without Ghostscript installed.

## System Requirements

Smart PDF Compressor requires Ghostscript installed on the operating system.

The npm package is a high-level processing and orchestration tool.

Actual PDF compression is performed by Ghostscript.

Current support:

* macOS

Planned:

* Linux
* Windows

Runtime requirements:

* macOS
* Node.js 20 or newer
* Ghostscript available through the `gs` command

## Installing Ghostscript

### macOS installation

```bash
brew install ghostscript
```

### Verify installation

```bash
gs --version
```

Expected result:

```text
10.05.1
```

Any recent Ghostscript version should work, but the command must be available in your terminal through `PATH`.

## Installation

```bash
npm install -g smart-pdf-compressor
```

CLI commands installed by the package:

```bash
smart-pdf-compressor
spdf
```

`spdf` is the short alias.

## First Run

1. Install Ghostscript

```bash
brew install ghostscript
```

2. Verify installation

```bash
gs --version
```

3. Install npm package

```bash
npm install -g smart-pdf-compressor
```

4. Initialize config

```bash
spdf init
```

5. Run diagnostics

```bash
spdf --doctor
```

6. First compression

```bash
spdf ./documents ./compressed
```

## Usage

```bash
spdf <input-folder> <output-folder> [options]
```

Example:

```bash
spdf ./documents ./compressed
```

The input folder may contain many nested directories. The output folder mirrors the input structure and preserves Unicode filenames, including Cyrillic and Ukrainian paths.

Example input:

```text
documents/
  scans/passport.pdf
  scans/photo.jpg
  notes/info.txt
```

Example output with `--copy-all`:

```text
compressed/
  scans/passport.pdf
  scans/photo.jpg
  notes/info.txt
```

PDF files always go through the PDF processing pipeline. Non-PDF files are copied only when `--copy-all` is enabled.

## Commands

### `spdf init`

Creates:

```text
smart-pdf.config.json
```

### `spdf --doctor`

Checks:

* Ghostscript installation
* PATH access
* filesystem permissions
* available disk space

### `spdf config show`

Prints the active configuration after loading defaults, local config, and CLI overrides.

### `spdf config reset`

Resets `smart-pdf.config.json` to default values.

## Runtime Flags

Runtime flags do not get saved to the config file.

* `--dry-run` analyzes files without writing output files.
* `--verbose` enables detailed logs.
* `--debug` enables debug logs.
* `--workers=NUMBER` overrides worker count. Maximum supported value is `4`.
* `--copy-all` copies all non-PDF files through stream processing.
* `--on-conflict=MODE` controls output conflicts. Supported modes: `skip`, `overwrite`, `rename`.
* `--silent` disables macOS notifications.

CLI flags override config values for the current run only.

## Examples

Basic compression:

```bash
spdf ./docs ./out
```

Copy all files while processing PDFs:

```bash
spdf ./docs ./out --copy-all
```

Dry run:

```bash
spdf ./docs ./out --dry-run
```

Verbose mode:

```bash
spdf ./docs ./out --verbose
```

Debug mode:

```bash
spdf ./docs ./out --debug
```

Limit workers:

```bash
spdf ./docs ./out --workers=2
```

Rename output files when a conflict exists:

```bash
spdf ./docs ./out --copy-all --on-conflict=rename
```

Skip notifications:

```bash
spdf ./docs ./out --silent
```

Run diagnostics:

```bash
spdf --doctor
```

Show active config:

```bash
spdf config show
```

## Safe Mode

Smart PDF Compressor is designed to protect source documents.

The input folder is treated as read-only.

The tool never:

* modifies original files
* deletes original files
* overwrites original files
* creates temporary files inside the input folder

Temporary operations happen in:

* memory
* the application temp directory
* the output folder

Safe mode also prevents dangerous path layouts:

* `output-folder` must not equal `input-folder`
* `output-folder` must not be inside `input-folder`

If violated, the process exits immediately:

```text
ERROR:
Input and output folders must be different.
```

or:

```text
ERROR:
Output folder must not be inside input folder.
```

## PDF Analysis

Before compression, every PDF is analyzed for:

* image count
* embedded image dimensions
* approximate DPI
* JPEG and PNG-like streams
* embedded font size
* compressed stream ratio
* scan detection
* text percentage
* estimated reducibility

The analyzer uses `pdfjs-dist` for text-layer inspection and low-level PDF stream scanning for image/font signals.

## Compression Logic

Compression modes:

* `aggressive` for heavy scans
* `medium` for mixed documents
* `light` for mostly text PDFs

Rules:

* Heavy scans use aggressive compression.
* Mostly text PDFs use light optimization.
* Mixed PDFs use medium compression.

If estimated reduction is below `10%`, the file is skipped:

```text
skip: already optimized
```

After compression, the output file is validated by size. If actual reduction is below `5%`, the compressed version is removed and the original remains untouched:

```text
compression not effective
```

## Copy-All Mode

`--copy-all` preserves full directory content, not just PDFs.

Copied file types include:

* images
* videos
* text files
* JSON
* archives
* any other non-PDF file

Important:

PDF files are never copied directly. PDF files always go through:

1. analysis
2. compression decision
3. Ghostscript processing when useful
4. post-compression validation

Non-PDF files are copied with stream processing using `fs.createReadStream`, `fs.createWriteStream`, and `stream.pipeline`.

Conflict modes:

* `skip`
* `overwrite`
* `rename`

Example:

```bash
spdf ./docs ./out --copy-all --on-conflict=skip
```

## Config System

Smart PDF Compressor automatically looks for:

```text
smart-pdf.config.json
```

in the current working directory.

`spdf init` creates a config file with a `$schema` field so editors such as VS Code can provide validation and autocomplete.

Loading order:

1. built-in defaults
2. `smart-pdf.config.json`
3. CLI runtime flags

CLI flags override config values but are not persisted.

Example config:

```json
{
  "$schema": "https://raw.githubusercontent.com/cobchenyuk/smart-pdf-compressor/main/schema/smart-pdf.config.schema.json",
  "compression": {
    "minEstimatedReductionPercent": 10,
    "minSavingsPercent": 5,
    "skipOptimized": true,
    "aggressiveScanCompression": true
  },
  "workers": {
    "maxWorkers": 4
  },
  "logging": {
    "saveLogs": true,
    "logLevel": "info"
  },
  "reports": {
    "generateJsonReport": true
  },
  "copyAll": {
    "enabled": false,
    "onConflict": "skip",
    "preserveTimestamps": true
  },
  "notifications": {
    "enabled": true,
    "success": true,
    "errors": true,
    "warnings": true
  },
  "performance": {
    "largeFileThresholdMB": 100,
    "maxConcurrentLargeFiles": 1
  },
  "safety": {
    "safeMode": true
  }
}
```

Config validation checks value types. Example error:

```text
ERROR:
workers.maxWorkers must be a number
```

## TypeScript Support

Smart PDF Compressor ships TypeScript declaration files for its public programmatic API.

Package metadata exposes:

```json
{
  "types": "./types/index.d.ts"
}
```

Example:

```ts
import {
  analyzePdf,
  checkGhostscript,
  loadConfig
} from "smart-pdf-compressor";

const gs = await checkGhostscript();
const { config } = await loadConfig({ cwd: process.cwd() });
const analysis = await analyzePdf("./document.pdf", {
  config,
  logger: console
});
```

Config types are also available:

```ts
import type { SmartPdfConfig } from "smart-pdf-compressor";
```

The JSON Schema is published with the package and exported as:

```ts
import schema from "smart-pdf-compressor/config-schema";
```

For editor validation, use:

```json
{
  "$schema": "https://raw.githubusercontent.com/cobchenyuk/smart-pdf-compressor/main/schema/smart-pdf.config.schema.json"
}
```

## Logging

Logger levels:

* `info`
* `warn`
* `error`
* `debug`

Logs are written in realtime to the console and persisted under:

```text
<output-folder>/.smart-pdf-compressor/logs/
```

The log stream is opened early so logs survive long-running processing failures as much as possible.

## Realtime Dashboard

The dashboard shows:

* total files
* processed PDF files
* compressed PDF files
* skipped PDF files
* copied files
* failed files
* current file
* elapsed time
* ETA
* processing speed
* saved bytes

## Reports

After completion, a summary is printed:

* total files
* compressed files
* skipped files
* copied files
* failed files
* original total size
* final total size
* total saved space
* average compression ratio

JSON report path:

```text
<output-folder>/.smart-pdf-compressor/report.json
```

Example:

```json
{
  "processedPdf": 120,
  "compressedPdf": 87,
  "skippedPdf": 30,
  "copiedFiles": 42,
  "failed": 7,
  "savedBytes": 182736182
}
```

# Notifications

Smart PDF Compressor supports native macOS desktop notifications for long-running processing tasks.

Notifications help track:

* completion status
* errors
* warnings
* large file events

without constantly watching the terminal.

Notifications currently supported:

* macOS

The current implementation uses native macOS notifications through `osascript`. The notification layer is isolated behind a small internal interface so future Linux and Windows support can be added with matching behavior.

## Notification Events

### Processing Completed

Sent when processing finishes successfully.

Example:

```text
Title:
Compression complete

Message:
37 files processed
541 MB saved
23 seconds
```

### Processing Failed

Sent when a critical error occurs.

Example:

```text
Title:
Processing failed

Message:
Check logs for details.
```

### Large File Detected

Sent when an extremely large file is detected.

Example:

```text
Title:
Large file detected

Message:
medical_scan.pdf
2.4 GB
```

The threshold is controlled by:

```json
{
  "performance": {
    "largeFileThresholdMB": 100
  }
}
```

### Low Disk Space

Sent when available disk space near the output folder drops below the configured warning threshold.

Example:

```text
Title:
Low disk space

Message:
Only 420 MB available near output folder.
```

The threshold is controlled by:

```json
{
  "safety": {
    "lowDiskSpaceWarningMB": 512
  }
}
```

### Recovery Warning

Sent when the previous session appears to have ended before clean shutdown.

Example:

```text
Title:
Recovery warning

Message:
Previous session did not finish cleanly. Check logs.
```

Smart PDF Compressor writes a small session marker under:

```text
<output-folder>/.smart-pdf-compressor/session.lock
```

The marker is removed after a clean completion.

## Notification Config

```json
{
  "notifications": {
    "enabled": true,
    "success": true,
    "errors": true,
    "warnings": true
  }
}
```

Config options:

* `enabled` enables notifications globally.
* `success` enables notifications for successful completion.
* `errors` enables notifications for failures.
* `warnings` enables notifications for warnings.

## Runtime Flag

Use `--silent` to temporarily disable notifications for the current run.

Example:

```bash
spdf ./docs ./out --silent
```

`--silent` does not modify `smart-pdf.config.json`.

## Anti-Spam Protection

The notification system is designed to prevent spam.

Repeated notifications are throttled by event type. If many files fail, Smart PDF Compressor uses an aggregated notification instead of sending one notification per file.

Example:

```text
Title:
Multiple processing errors

Message:
12 files failed.
```

## Background Usage

Notifications are especially useful for:

* huge directory processing
* long-running compression tasks
* background terminal sessions

The design goal is to improve the UX of long-running CLI operations without interrupting the workflow.

## Large File Handling

Smart PDF Compressor is designed for large file collections.

It uses controlled worker concurrency and a separate limit for large files:

```json
{
  "performance": {
    "largeFileThresholdMB": 100,
    "maxConcurrentLargeFiles": 1
  }
}
```

For non-PDF files, copying is stream-based and avoids loading large files into RAM.

For PDF analysis, the tool limits low-level structure reads to avoid memory spikes. Ghostscript performs the actual compression in a separate process.

## Architecture

The npm package orchestrates processing.

Ghostscript performs compression.

Node.js handles:

* analysis
* orchestration
* logging
* monitoring
* filesystem processing
* worker management
* config loading and validation
* reporting
* macOS notifications

Project structure:

```text
src/
  analyzer/
  compressor/
  workers/
  streams/
  logger/
  reports/
  notifications/
  config/
  cli/
  utils/
```

## Design Philosophy

Smart PDF Compressor is built around:

* safe filesystem operations
* original files protection
* rule-based compression decisions
* stream-based processing
* large file support
* production reliability
* predictable logs and reports
* conservative defaults

The tool favors preserving data safety over forcing compression. If a compressed PDF is not meaningfully smaller, it is discarded.

## Authorship

Smart PDF Compressor is authored and maintained by cobchenyuk <cobchenyuk@gmail.com>.

Author profile: [Andrey Sobchenyuk](https://www.linkedin.com/in/sobchenyuk-andrey/)

## Troubleshooting

### Ghostscript not found

Error:

```text
ERROR:
Ghostscript not found.
```

Solution:

```bash
brew install ghostscript
```

Then verify:

```bash
gs --version
```

### `gs` command not available

Problem:

Ghostscript is installed but the `gs` command is not found.

Recommendations:

* restart terminal
* check `PATH`
* run:

```bash
which gs
```

If `which gs` prints nothing, the Ghostscript binary is not available in your shell path.

### Output folder rejected

The output folder must not be the same as input and must not be nested inside input.

Use a separate sibling folder:

```bash
spdf ./documents ./compressed
```

### Config validation error

Example:

```text
ERROR:
workers.maxWorkers must be a number
```

Open `smart-pdf.config.json` and make sure the value type is correct:

```json
{
  "workers": {
    "maxWorkers": 4
  }
}
```

## Disclaimer

This tool performs filesystem operations on large file collections.

Always keep backups of important documents.
