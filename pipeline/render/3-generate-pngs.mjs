#!/usr/bin/env node
// Step 3 of the render pipeline: rasterise each <output>/svgs/<id>_embed.svg
// specimen with sharp into a 224x224 <output>/pngs/<id>_embed.png on white (the
// native CLIP ViT-B/32 input resolution), the input of compute_fontclip_embeddings.py.
// Fonts without an _embed.svg fall back to their _a.svg (-> <id>_a.png).
// Each PNG is checked for plausible ink coverage; rejected PNGs are still written.
//
// Usage (from the repo root):
//   node pipeline/render/3-generate-pngs.mjs [--output <dir>] [--fonts <id,id>]

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { parseArgs, COMMON_USAGE } from './cli.mjs';

const USAGE = `Rasterise the specimen SVGs into 224x224 PNGs for FontCLIP.\n\n${COMMON_USAGE}`;
const { outputDir, fonts } = parseArgs(USAGE);
const SVGS_DIR = path.join(outputDir, 'svgs');
const PNGS_DIR = path.join(outputDir, 'pngs');
const PNG_SIZE = 224; // Native CLIP ViT-B/32 input resolution

// Share of black, white, grey and transparent pixels
async function analyzePNGQuality(pngPath) {
  try {
    const image = sharp(pngPath);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const totalPixels = width * height;

    let blackPixels = 0;
    let whitePixels = 0;
    let grayPixels = 0;
    let transparentPixels = 0;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels === 4 ? data[i + 3] : 255;

      if (a < 128) {
        transparentPixels++;
      } else if (r < 50 && g < 50 && b < 50) {
        blackPixels++;
      } else if (r > 200 && g > 200 && b > 200) {
        whitePixels++;
      } else {
        grayPixels++;
      }
    }

    const blackPercentage = (blackPixels / totalPixels) * 100;
    const whitePercentage = (whitePixels / totalPixels) * 100;
    const grayPercentage = (grayPixels / totalPixels) * 100;
    const transparentPercentage = (transparentPixels / totalPixels) * 100;

    return {
      totalPixels,
      blackPixels,
      whitePixels,
      grayPixels,
      transparentPixels,
      blackPercentage,
      whitePercentage,
      grayPercentage,
      transparentPercentage,
      hasContent: blackPixels > 0,
      isMostlyWhite: whitePercentage > 90,
      hasTransparency: transparentPixels > 0
    };

  } catch (error) {
    console.error('  Error analysing the PNG:', error.message);
    return null;
  }
}

function validatePNGQuality(analysis) {
  const issues = [];

  if (!analysis) {
    issues.push('Could not analyse the PNG');
    return { valid: false, issues };
  }

  if (!analysis.hasContent) {
    issues.push('No black pixel (invisible font)');
    return { valid: false, issues };
  }

  if (analysis.isMostlyWhite && analysis.blackPercentage < 1) {
    issues.push('Almost entirely white (font too small)');
    return { valid: false, issues };
  }

  if (analysis.transparentPercentage > 10) {
    issues.push('Too much transparency');
    return { valid: false, issues };
  }

  if (analysis.blackPercentage < 0.1) {
    issues.push('Not enough black content (font too thin)');
    return { valid: false, issues };
  }

  if (analysis.blackPercentage > 50) {
    issues.push('Too much black content (possibly corrupted)');
    return { valid: false, issues };
  }

  return { valid: true, issues: [] };
}

async function convertSvgToPng(svgPath, pngPath) {
  try {
    const svgBuffer = await fs.readFile(svgPath);

    await sharp(svgBuffer)
      .resize(PNG_SIZE, PNG_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(pngPath);

    const analysis = await analyzePNGQuality(pngPath);
    const validation = validatePNGQuality(analysis);

    if (!validation.valid) {
      return { success: false, analysis, issues: validation.issues };
    }

    return { success: true, analysis, issues: [] };

  } catch (error) {
    console.error(`  Error converting ${svgPath}:`, error.message);
    return { success: false, analysis: null, issues: [error.message] };
  }
}

async function processSvg(svgFile) {
  const svgPath = path.join(SVGS_DIR, svgFile);
  const pngPath = path.join(PNGS_DIR, svgFile.replace('.svg', '.png'));
  const fontId = svgFile.replace('_embed.svg', '').replace('_a.svg', '');

  const result = await convertSvgToPng(svgPath, pngPath);
  return result.success
    ? { success: true, fontId, quality: result.analysis }
    : { success: false, fontId, error: `Insufficient quality: ${result.issues.join(', ')}` };
}

async function main() {
  try {
    await fs.mkdir(PNGS_DIR, { recursive: true });

    // Prefer the multi-glyph _embed.svg, fall back to _a.svg
    const svgFiles = await fs.readdir(SVGS_DIR);
    const keep = (suffix) => (f) => f.endsWith(suffix) && (!fonts || fonts.has(f.slice(0, -suffix.length)));
    const embedSvgFiles = svgFiles.filter(keep('_embed.svg'));
    const letterASvgFiles = svgFiles.filter(keep('_a.svg'));

    const embedIds = new Set(embedSvgFiles.map(f => f.replace('_embed.svg', '')));
    const fallbackFiles = letterASvgFiles.filter(f => !embedIds.has(f.replace('_a.svg', '')));
    const targetSvgFiles = [...embedSvgFiles, ...fallbackFiles];

    if (targetSvgFiles.length === 0) {
      throw new Error(`No SVG file found in ${SVGS_DIR}`);
    }

    console.log(`Rasterising ${embedSvgFiles.length} specimen SVGs + ${fallbackFiles.length} "A" fallbacks into ${PNGS_DIR} (${PNG_SIZE}x${PNG_SIZE})`);

    const results = [];
    for (let i = 0; i < targetSvgFiles.length; i++) {
      const svgFile = targetSvgFiles[i];
      const result = await processSvg(svgFile);
      results.push(result);

      const prefix = `[${i + 1}/${targetSvgFiles.length}] ${svgFile}`;
      if (result.success) {
        console.log(`${prefix}: ok, ${result.quality.blackPercentage.toFixed(1)}% black`);
      } else {
        console.log(`${prefix}: REJECTED, ${result.error}`);
      }
    }

    const failed = results.filter(r => !r.success);
    console.log(`Done: ${results.length - failed.length} PNGs ok, ${failed.length} rejected, in ${PNGS_DIR}`);
    if (failed.length > 0) {
      console.log('Rejected fonts:');
      failed.forEach(r => console.log(`  - ${r.fontId}: ${r.error}`));
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
