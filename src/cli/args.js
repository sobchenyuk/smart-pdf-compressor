export function parseArgs(argv) {
  const args = argv.slice(2);
  const command = detectCommand(args);
  const positional = [];
  const options = {
    dryRun: false,
    verbose: false,
    debug: false,
    silent: false,
    copyAll: false,
    onConflict: undefined,
    workers: undefined,
    retries: undefined,
    help: false,
    version: false,
    doctor: false
  };

  for (let index = command.consumed; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--doctor') options.doctor = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--debug') options.debug = true;
    else if (arg === '--silent') options.silent = true;
    else if (arg === '--copy-all') options.copyAll = true;
    else if (arg === '--workers') options.workers = readNumber(args, ++index, '--workers');
    else if (arg.startsWith('--workers=')) options.workers = parseNumber(arg.split('=')[1], '--workers');
    else if (arg === '--retries') options.retries = readNumber(args, ++index, '--retries');
    else if (arg.startsWith('--retries=')) options.retries = parseNumber(arg.split('=')[1], '--retries');
    else if (arg === '--on-conflict') options.onConflict = readString(args, ++index, '--on-conflict');
    else if (arg.startsWith('--on-conflict=')) options.onConflict = arg.slice('--on-conflict='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return {
    command: command.name,
    subcommand: command.subcommand,
    positional,
    options
  };
}

export function usage() {
  return [
    'Usage:',
    '  spdf <input-folder> <output-folder> [options]',
    '  spdf init',
    '  spdf --doctor',
    '  spdf config show',
    '  spdf config reset',
    '',
    'Options:',
    '  --dry-run                Analyze without writing compressed PDFs.',
    '  --verbose                Enable detailed logs.',
    '  --debug                  Enable debug logs.',
    '  --workers=NUMBER         Override worker count, max 4.',
    '  --copy-all               Copy non-PDF files while processing PDFs.',
    '  --on-conflict=MODE       skip, overwrite, or rename.',
    '  --silent                 Disable macOS notifications.',
    '  --doctor                 Check Ghostscript, PATH, permissions, disk space.',
    '  --help                   Show help.'
  ].join('\n');
}

function detectCommand(args) {
  if (args[0] === 'init') return { name: 'init', consumed: 1 };
  if (args[0] === 'config') return { name: 'config', subcommand: args[1], consumed: 2 };
  return { name: 'process', consumed: 0 };
}

function readNumber(args, index, name) {
  return parseNumber(readString(args, index, name), name);
}

function readString(args, index, name) {
  if (index >= args.length || args[index].startsWith('-')) {
    throw new Error(`${name} requires a value.`);
  }
  return args[index];
}

function parseNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}
