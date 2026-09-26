// Shared command-line options for the render scripts.
//
//   --output <dir>      pipeline output directory (default: pipeline/output)
//   --font-index <path> font index JSON (default: pipeline/input/font-index.json)
//   --fonts <id,id,...> only process these font ids

import path from 'path';
import { fileURLToPath } from 'url';

const PIPELINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(usage) {
  const options = {
    outputDir: path.join(PIPELINE_DIR, 'output'),
    fontIndex: path.join(PIPELINE_DIR, 'input', 'font-index.json'),
    fonts: null,
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [flag, inlineValue] = arg.split(/=(.*)/s, 2);
    const value = () => {
      const v = inlineValue ?? args[++i];
      if (v === undefined) {
        console.error(`Missing value for ${flag}`);
        process.exit(1);
      }
      return v;
    };

    switch (flag) {
      case '--output':
        options.outputDir = path.resolve(value());
        break;
      case '--font-index':
        options.fontIndex = path.resolve(value());
        break;
      case '--fonts':
        options.fonts = new Set(value().split(',').map((id) => id.trim()).filter(Boolean));
        break;
      case '--help':
      case '-h':
        console.log(usage);
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}\n\n${usage}`);
        process.exit(1);
    }
  }

  return options;
}

export const COMMON_USAGE = `Options:
  --output <dir>       pipeline output directory (default: pipeline/output)
  --font-index <path>  font index JSON (default: pipeline/input/font-index.json)
  --fonts <id,id,...>  only process these font ids`;
