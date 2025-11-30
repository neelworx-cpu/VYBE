#!/usr/bin/env node
/**
 * VYBE Icon Generation Script
 *
 * Generates PNG icons from the VYBE logo SVG for use in app icons.
 * Requires: npm install --save-dev @resvg/resvg-js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const svgPath = path.join(rootDir, 'resources/vybe/icons/vybe-logo.svg');
const iconsDir = path.join(rootDir, 'resources/vybe/icons');

// Icon sizes to generate
const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function generateIcons() {
  try {
    // Check if SVG exists
    if (!fs.existsSync(svgPath)) {
      console.error(`Error: SVG not found at ${svgPath}`);
      process.exit(1);
    }

    // Read SVG
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    console.log('Generating VYBE icons from SVG...');

    // Generate each size
    for (const size of sizes) {
      const outputPath = path.join(iconsDir, `vybe-icon-${size}.png`);

      const opts = {
        fitTo: {
          mode: 'width',
          value: size,
        },
        font: {
          loadSystemFonts: false,
        },
      };

      const resvg = new Resvg(svgContent, opts);
      const pngData = resvg.render();
      fs.writeFileSync(outputPath, pngData.asPng());

      console.log(`✓ Generated ${outputPath} (${size}x${size})`);
    }

    // Also generate the specific sizes needed for Windows (70x70 and 150x150)
    const windowsSizes = [70, 150];
    for (const size of windowsSizes) {
      const outputPath = path.join(iconsDir, `vybe-icon-${size}.png`);

      const opts = {
        fitTo: {
          mode: 'width',
          value: size,
        },
        font: {
          loadSystemFonts: false,
        },
      };

      const resvg = new Resvg(svgContent, opts);
      const pngData = resvg.render();
      fs.writeFileSync(outputPath, pngData.asPng());

      console.log(`✓ Generated ${outputPath} (${size}x${size})`);
    }

    console.log('\n✓ All icons generated successfully!');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('\nError: Required module not found.');
      console.error('Please install it with: npm install --save-dev @resvg/resvg-js\n');
    } else {
      console.error('Error generating icons:', error);
    }
    process.exit(1);
  }
}

generateIcons();

