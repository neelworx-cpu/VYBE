#!/usr/bin/env node
/**
 * VYBE Windows .ico Generation Script
 *
 * Generates a multi-resolution .ico file from PNG icons for Windows app icon.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import toIco from 'to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const iconsDir = path.join(rootDir, 'resources/vybe/icons');
const icoPath = path.join(iconsDir, 'vybe.ico');

// ICO file should include multiple sizes for best compatibility
const iconSizes = [16, 32, 48, 64, 128, 256];

async function generateIco() {
  try {
    console.log('Generating Windows .ico file...');

    // Read PNG files for each size
    const buffers = [];
    for (const size of iconSizes) {
      const pngPath = path.join(iconsDir, `vybe-icon-${size}.png`);
      if (fs.existsSync(pngPath)) {
        buffers.push(fs.readFileSync(pngPath));
        console.log(`✓ Included ${size}x${size} icon`);
      } else {
        console.warn(`⚠ Warning: ${pngPath} not found, skipping ${size}x${size}`);
      }
    }

    if (buffers.length === 0) {
      console.error('Error: No PNG icons found to include in .ico file');
      process.exit(1);
    }

    // Generate .ico file
    const ico = await toIco(buffers);
    fs.writeFileSync(icoPath, ico);

    console.log(`\n✓ Generated ${icoPath} successfully!`);
    console.log(`  Included ${buffers.length} icon size(s)`);
  } catch (error) {
    console.error('Error generating .ico:', error);
    process.exit(1);
  }
}

generateIco();

