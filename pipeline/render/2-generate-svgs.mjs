#!/usr/bin/env node
// Step 2 of the render pipeline: vectorise each downloaded font with opentype.js
// into three SVGs in <output>/svgs/:
//   <id>_a.svg         80x80 "A" glyph (used to detect fonts without Latin glyphs)
//   <id>_embed.svg     224x224 two-line "Hamburge" / "fonstiv" specimen, rasterised
//                      by step 3 and fed to FontCLIP
//   <id>_sentence.svg  "Lorem Ipsum" preview shown in the sidebar and the tooltip
//                      (copied to public/data/sentences/)
// and writes <output>/font_manifest.json (dimensions and metrics of each SVG).
//
// Usage (from the repo root):
//   node pipeline/render/2-generate-svgs.mjs [--output <dir>] [--font-index <path>] [--fonts <id,id>]

import fs from 'fs/promises';
import path from 'path';
import opentype from 'opentype.js';
import { parseArgs, COMMON_USAGE } from './cli.mjs';

const USAGE = `Render the "A", specimen and sentence SVGs of every downloaded font.\n\n${COMMON_USAGE}`;
const { outputDir, fontIndex, fonts } = parseArgs(USAGE);
const FONTS_DIR = path.join(outputDir, 'fonts');
const SVGS_DIR = path.join(outputDir, 'svgs');
const MANIFEST_PATH = path.join(outputDir, 'font_manifest.json');

function validateSVGQuality(svg) {
  const issues = [];

  if (!svg || svg.trim().length === 0) {
    issues.push('Empty SVG');
    return { valid: false, issues };
  }

  if (!svg.includes('<path')) {
    issues.push('No path elements found');
    return { valid: false, issues };
  }

  const pathMatch = svg.match(/<path[^>]*d=["']([^"']+)["']/);
  if (!pathMatch || !pathMatch[1] || pathMatch[1].trim().length === 0) {
    issues.push('Empty path data');
    return { valid: false, issues };
  }

  const pathData = pathMatch[1];
  if (pathData.length < 10) {
    issues.push('Path data too simple');
    return { valid: false, issues };
  }

  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    issues.push('Invalid SVG structure');
    return { valid: false, issues };
  }

  return { valid: true, issues: [] };
}

// "A" glyph centred in an 80x80 box
async function generateLetterASVG(fontPath, fontFamily) {
  try {
    const fontBuffer = await fs.readFile(fontPath);
    const font = opentype.parse(fontBuffer.buffer);

    const glyph = font.charToGlyph('A');
    if (!glyph || !glyph.path) {
      throw new Error('Glyph A not found or without path');
    }

    const SVG_SIZE = 80;
    const fontSize = 60;

    const tempPath = glyph.getPath(0, 0, fontSize);
    const bbox = tempPath.getBoundingBox();

    if (!bbox || bbox.x1 === undefined || bbox.x2 === undefined ||
        bbox.y1 === undefined || bbox.y2 === undefined) {
      throw new Error('Invalid bounding box');
    }

    const glyphWidth = bbox.x2 - bbox.x1;
    const glyphHeight = bbox.y2 - bbox.y1;

    if (glyphWidth <= 0 || glyphHeight <= 0) {
      throw new Error('Invalid glyph dimensions');
    }

    if (glyphWidth < 5 || glyphHeight < 5) {
      throw new Error('Glyph too small (probably empty)');
    }

    const centerX = SVG_SIZE / 2;
    const centerY = SVG_SIZE / 2;

    const offsetX = centerX - (bbox.x1 + glyphWidth / 2);
    const offsetY = centerY - (bbox.y1 + glyphHeight / 2);

    const adjustedPath = glyph.getPath(offsetX, offsetY, fontSize);
    const svgPathData = adjustedPath.toPathData(2);

    if (!svgPathData || svgPathData.trim().length === 0) {
      throw new Error('Empty path data after generation');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}">
  <path d="${svgPathData}" fill="currentColor"/>
</svg>`;

    const validation = validateSVGQuality(svg);
    if (!validation.valid) {
      throw new Error(`Low-quality SVG: ${validation.issues.join(', ')}`);
    }

    return {
      svg,
      width: SVG_SIZE,
      height: SVG_SIZE,
      fontMetrics: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender
      }
    };

  } catch (error) {
    console.error(`  Error generating the A SVG for ${fontFamily}:`, error.message);
    return null;
  }
}

// Multi-glyph specimen for the FontCLIP embedding: "Hamburgefons" on two lines
// in a 224x224 square, covering upper/lower case, ascenders (b, f, h), a
// descender (g), curves (o, e, s), diagonals (v), serifs and stroke contrast.
async function generateEmbeddingSVG(fontPath, fontFamily) {
  const EMBED_LINES = ['Hamburge', 'fonstiv'];
  const SVG_SIZE = 224;
  const PADDING = 12;

  try {
    const fontBuffer = await fs.readFile(fontPath);
    const font = opentype.parse(fontBuffer.buffer);

    const lineCount = EMBED_LINES.length;
    const availableHeight = SVG_SIZE - PADDING * 2;
    const lineHeight = availableHeight / lineCount;
    const fontSize = Math.floor(lineHeight * 0.75);

    let allPathsData = '';

    for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
      const text = EMBED_LINES[lineIdx];
      const textPath = font.getPath(text, 0, 0, fontSize);
      const bbox = textPath.getBoundingBox();

      if (!bbox || bbox.x2 - bbox.x1 <= 0 || bbox.y2 - bbox.y1 <= 0) continue;

      const textWidth = bbox.x2 - bbox.x1;
      const textHeight = bbox.y2 - bbox.y1;

      const scale = Math.min(
        (SVG_SIZE - PADDING * 2) / textWidth,
        lineHeight * 0.85 / textHeight,
        1.0
      );

      const scaledWidth = textWidth * scale;
      const offsetX = (SVG_SIZE - scaledWidth) / 2 - bbox.x1 * scale;
      const lineY = PADDING + lineIdx * lineHeight + lineHeight / 2;
      const offsetY = lineY - (bbox.y1 + textHeight / 2) * scale;

      if (scale !== 1.0) {
        const adjusted = font.getPath(text, 0, 0, fontSize * scale);
        const adjBbox = adjusted.getBoundingBox();
        const adjW = adjBbox.x2 - adjBbox.x1;
        const adjH = adjBbox.y2 - adjBbox.y1;
        const ox = (SVG_SIZE - adjW) / 2 - adjBbox.x1;
        const oy = lineY - (adjBbox.y1 + adjH / 2);
        const final = font.getPath(text, ox, oy, fontSize * scale);
        allPathsData += ` ${final.toPathData(2)}`;
      } else {
        const final = font.getPath(text, offsetX, offsetY, fontSize);
        allPathsData += ` ${final.toPathData(2)}`;
      }
    }

    allPathsData = allPathsData.trim();
    if (!allPathsData || allPathsData.length < 10) {
      throw new Error('Specimen paths empty or too simple');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}">
  <rect width="${SVG_SIZE}" height="${SVG_SIZE}" fill="white"/>
  <path d="${allPathsData}" fill="black"/>
</svg>`;

    return {
      svg,
      width: SVG_SIZE,
      height: SVG_SIZE,
      lines: EMBED_LINES,
      fontMetrics: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender
      }
    };

  } catch (error) {
    console.error(`  Error generating the specimen SVG for ${fontFamily}:`, error.message);
    return null;
  }
}

// "Lorem Ipsum" at 24px with a 10px margin
async function generateSentenceSVG(fontPath, fontFamily) {
  try {
    const fontBuffer = await fs.readFile(fontPath);
    const font = opentype.parse(fontBuffer.buffer);

    const loremText = 'Lorem Ipsum';
    const fontSize = 24;
    const padding = 10;

    const textPath = font.getPath(loremText, 0, 0, fontSize);
    const bbox = textPath.getBoundingBox();

    if (!bbox || bbox.x1 === undefined || bbox.x2 === undefined ||
        bbox.y1 === undefined || bbox.y2 === undefined) {
      throw new Error('Invalid bounding box for the text');
    }

    const textWidth = bbox.x2 - bbox.x1;
    const textHeight = bbox.y2 - bbox.y1;

    if (textWidth <= 0 || textHeight <= 0) {
      throw new Error('Invalid text dimensions');
    }

    const margin = padding;
    const svgWidth = Math.ceil(textWidth) + (margin * 2);
    const svgHeight = Math.ceil(textHeight) + (margin * 2);

    const offsetX = margin - bbox.x1;
    const offsetY = margin - bbox.y1;

    const adjustedPath = font.getPath(loremText, offsetX, offsetY, fontSize);
    const svgPathData = adjustedPath.toPathData(2);

    if (!svgPathData || svgPathData.trim().length === 0) {
      throw new Error('Empty path data after generation');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <path d="${svgPathData}" fill="currentColor"/>
</svg>`;

    const validation = validateSVGQuality(svg);
    if (!validation.valid) {
      throw new Error(`Low-quality SVG: ${validation.issues.join(', ')}`);
    }

    return {
      svg,
      width: svgWidth,
      height: svgHeight,
      text: loremText,
      measuredWidth: textWidth,
      fontMetrics: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender
      }
    };

  } catch (error) {
    console.error(`  Error generating the sentence SVG for ${fontFamily}:`, error.message);
    return null;
  }
}

async function processFontFamily(fontId, fontData) {
  const fontDir = path.join(FONTS_DIR, fontId);

  try {
    // The TrueType file is saved as .truetype by step 1 (the font index format key)
    const files = await fs.readdir(fontDir);
    const ttfFile = files.find(f => f.endsWith('.ttf') || f.endsWith('.truetype'));

    if (!ttfFile) {
      throw new Error('TTF file not found');
    }

    const fontPath = path.join(fontDir, ttfFile);

    const letterResult = await generateLetterASVG(fontPath, fontData.family);
    if (!letterResult) {
      throw new Error('Failed to generate the A SVG');
    }
    const letterSvgPath = path.join(SVGS_DIR, `${fontId}_a.svg`);
    await fs.writeFile(letterSvgPath, letterResult.svg, 'utf-8');

    const embedResult = await generateEmbeddingSVG(fontPath, fontData.family);
    if (!embedResult) {
      throw new Error('Failed to generate the specimen SVG');
    }
    const embedSvgPath = path.join(SVGS_DIR, `${fontId}_embed.svg`);
    await fs.writeFile(embedSvgPath, embedResult.svg, 'utf-8');

    const sentenceResult = await generateSentenceSVG(fontPath, fontData.family);
    if (!sentenceResult) {
      throw new Error('Failed to generate the sentence SVG');
    }
    const sentenceSvgPath = path.join(SVGS_DIR, `${fontId}_sentence.svg`);
    await fs.writeFile(sentenceSvgPath, sentenceResult.svg, 'utf-8');

    return {
      success: true,
      fontId,
      fontFamily: fontData.family,
      letterDimensions: {
        width: letterResult.width,
        height: letterResult.height
      },
      sentenceDimensions: {
        width: sentenceResult.width,
        height: sentenceResult.height,
        measuredWidth: sentenceResult.measuredWidth
      },
      fontMetrics: letterResult.fontMetrics,
      sentenceFontMetrics: sentenceResult.fontMetrics
    };

  } catch (error) {
    return {
      success: false,
      fontId,
      fontFamily: fontData.family,
      error: error.message
    };
  }
}

async function readExistingManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  try {
    await fs.access(fontIndex).catch(() => {
      throw new Error(`Font index not found: ${fontIndex}`);
    });
    await fs.mkdir(SVGS_DIR, { recursive: true });

    const fontIndexData = JSON.parse(await fs.readFile(fontIndex, 'utf8'));
    let fontIds = Object.keys(fontIndexData);
    if (fonts) fontIds = fontIds.filter((id) => fonts.has(id));
    console.log(`Rendering SVGs for ${fontIds.length} font families into ${SVGS_DIR}`);

    const results = [];
    for (let i = 0; i < fontIds.length; i++) {
      const fontId = fontIds[i];
      const fontData = fontIndexData[fontId];
      const result = await processFontFamily(fontId, fontData);
      results.push(result);

      const prefix = `[${i + 1}/${fontIds.length}] ${fontData.family} (${fontId})`;
      if (result.success) {
        console.log(`${prefix}: ok, sentence ${result.sentenceDimensions.width}x${result.sentenceDimensions.height}`);
      } else {
        console.log(`${prefix}: FAILED, ${result.error}`);
      }
    }

    // With --fonts, update the entries of those fonts and keep the others
    const manifest = fonts ? await readExistingManifest() : {};
    const successfulResults = results.filter(r => r.success);

    for (const result of successfulResults) {
      manifest[result.fontFamily] = {
        id: result.fontId,
        family: 'sans-serif',
        images: {
          A: `svgs/${result.fontId}_a.svg`,
          sentence: `svgs/${result.fontId}_sentence.svg`
        },
        svg: {
          A: {
            path: `svgs/${result.fontId}_a.svg`,
            width: result.letterDimensions.width,
            height: result.letterDimensions.height,
            viewBox: `0 0 ${result.letterDimensions.width} ${result.letterDimensions.height}`
          },
          sentence: {
            path: `svgs/${result.fontId}_sentence.svg`,
            width: result.sentenceDimensions.width,
            height: result.sentenceDimensions.height,
            viewBox: `0 0 ${result.sentenceDimensions.width} ${result.sentenceDimensions.height}`,
            measuredWidth: result.sentenceDimensions.measuredWidth
          }
        },
        fontMetrics: result.fontMetrics,
        sentenceFontMetrics: result.sentenceFontMetrics
      };
    }

    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

    const failed = results.filter(r => !r.success);
    console.log(`Done: ${successfulResults.length} fonts rendered (3 SVGs each), ${failed.length} failed`);
    console.log(`SVGs: ${SVGS_DIR}`);
    console.log(`Manifest: ${MANIFEST_PATH}`);
    if (failed.length > 0) {
      console.log('Failed fonts:');
      failed.forEach(r => console.log(`  - ${r.fontFamily}: ${r.error}`));
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
