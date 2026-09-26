#!/usr/bin/env node
// Step 1 of the render pipeline: download the main font file of every family
// listed in the font index (weight 400, normal style, default subset, every
// format: woff2, woff, truetype) into <output>/fonts/<font-id>/.
// Files that already exist are skipped, so the script can be resumed.
//
// Usage (from the repo root):
//   node pipeline/render/1-download-fonts.mjs [--output <dir>] [--font-index <path>] [--fonts <id,id>]

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'fs';
import { parseArgs, COMMON_USAGE } from './cli.mjs';

const USAGE = `Download the Google Fonts files listed in the font index.\n\n${COMMON_USAGE}`;
const { outputDir, fontIndex, fonts } = parseArgs(USAGE);
const FONTS_DIR = path.join(outputDir, 'fonts');

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlink(filePath).catch(() => {}); // Remove partial file
        reject(new Error(`HTTP error ${response.statusCode} for ${url}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlink(filePath).catch(() => {}); // Remove partial file
      reject(err);
    });
  });
}

// Files of the main variant: weight 400 (else the first weight), normal style
// (else the first style), default subset (else the first subset).
function getMainFiles(fontData, fontId) {
  const files = [];
  const fontDir = path.join(FONTS_DIR, fontId);

  const mainWeight = fontData.variants['400'];
  if (!mainWeight) {
    const firstWeight = Object.keys(fontData.variants)[0];
    const firstWeightData = fontData.variants[firstWeight];
    const normalStyle = firstWeightData['normal'];

    if (normalStyle) {
      const defaultSubset = fontData.defSubset || Object.keys(normalStyle)[0];
      const subsetData = normalStyle[defaultSubset];

      if (subsetData) {
        for (const [format, url] of Object.entries(subsetData.url)) {
          const fileName = `${fontId}-${firstWeight}-normal-${defaultSubset}.${format}`;
          files.push({ fileName, filePath: path.join(fontDir, fileName), url });
        }
      }
    }
    return files;
  }

  const normalStyle = mainWeight['normal'];
  if (!normalStyle) {
    const firstStyle = Object.keys(mainWeight)[0];
    const firstStyleData = mainWeight[firstStyle];
    const defaultSubset = fontData.defSubset || Object.keys(firstStyleData)[0];
    const subsetData = firstStyleData[defaultSubset];

    if (subsetData) {
      for (const [format, url] of Object.entries(subsetData.url)) {
        const fileName = `${fontId}-400-${firstStyle}-${defaultSubset}.${format}`;
        files.push({ fileName, filePath: path.join(fontDir, fileName), url });
      }
    }
    return files;
  }

  const defaultSubset = fontData.defSubset || Object.keys(normalStyle)[0];
  const subsetData = normalStyle[defaultSubset];

  if (subsetData) {
    for (const [format, url] of Object.entries(subsetData.url)) {
      const fileName = `${fontId}-400-normal-${defaultSubset}.${format}`;
      files.push({ fileName, filePath: path.join(fontDir, fileName), url });
    }
  }

  return files;
}

async function downloadFontFamily(fontId, fontData) {
  await fs.mkdir(path.join(FONTS_DIR, fontId), { recursive: true });

  let downloadedCount = 0;
  for (const { fileName, filePath, url } of getMainFiles(fontData, fontId)) {
    try {
      try {
        await fs.access(filePath);
        downloadedCount++;
        continue;
      } catch {
        // Not downloaded yet
      }

      await downloadFile(url, filePath);
      downloadedCount++;
    } catch (error) {
      console.log(`  Error for ${fileName}: ${error.message}`);
    }
  }

  return downloadedCount;
}

async function main() {
  try {
    await fs.access(fontIndex).catch(() => {
      throw new Error(`Font index not found: ${fontIndex}`);
    });
    await fs.mkdir(FONTS_DIR, { recursive: true });

    const fontIndexData = JSON.parse(await fs.readFile(fontIndex, 'utf8'));
    let fontIds = Object.keys(fontIndexData);
    if (fonts) {
      const unknown = [...fonts].filter((id) => !fontIndexData[id]);
      if (unknown.length) console.log(`Not in the font index, skipped: ${unknown.join(', ')}`);
      fontIds = fontIds.filter((id) => fonts.has(id));
    }
    console.log(`Downloading the main variant (weight 400, normal style) of ${fontIds.length} font families into ${FONTS_DIR}`);

    let totalFiles = 0;
    for (let i = 0; i < fontIds.length; i++) {
      const fontId = fontIds[i];
      const fontData = fontIndexData[fontId];
      const count = await downloadFontFamily(fontId, fontData);
      totalFiles += count;
      console.log(`[${i + 1}/${fontIds.length}] ${fontData.family} (${fontId}): ${count} files`);
    }

    console.log(`Done: ${fontIds.length} families, ${totalFiles} files in ${FONTS_DIR}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
