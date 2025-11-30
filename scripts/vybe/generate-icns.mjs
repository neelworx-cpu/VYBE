#!/usr/bin/env node
/**
 * VYBE macOS .icns Generation Script
 *
 * Generates a .icns file from PNG icons for macOS app icon.
 * Uses macOS iconutil command (requires macOS).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const iconsDir = path.join(rootDir, 'resources/vybe/icons');
const iconsetDir = path.join(iconsDir, 'vybe.iconset');
const icnsPath = path.join(iconsDir, 'vybe.icns');

// macOS iconset requires specific sizes
const iconSizes = {
  'icon_16x16.png': 16,
  'icon_16x16@2x.png': 32,
  'icon_32x32.png': 32,
  'icon_32x32@2x.png': 64,
  'icon_128x128.png': 128,
  'icon_128x128@2x.png': 256,
  'icon_256x256.png': 256,
  'icon_256x256@2x.png': 512,
  'icon_512x512.png': 512,
  'icon_512x512@2x.png': 1024,
};

async function generateIcns() {
  try {
    // Check if we're on macOS
    if (process.platform !== 'darwin') {
      console.error('Error: This script requires macOS to use iconutil.');
      console.error('On other platforms, you can generate .icns manually or use online tools.');
      process.exit(1);
    }

    // Create iconset directory
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true });
    }
    fs.mkdirSync(iconsetDir, { recursive: true });

    console.log('Creating macOS iconset...');

    // Copy PNG files to iconset with proper naming
    for (const [iconsetName, size] of Object.entries(iconSizes)) {
      const sourcePath = path.join(iconsDir, `vybe-icon-${size}.png`);
      const destPath = path.join(iconsetDir, iconsetName);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`✓ Copied ${iconsetName} (${size}x${size})`);
      } else {
        console.warn(`⚠ Warning: ${sourcePath} not found, skipping ${iconsetName}`);
      }
    }

    // Generate .icns using iconutil
    console.log('\nGenerating .icns file...');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });

    // Clean up iconset directory
    fs.rmSync(iconsetDir, { recursive: true });

    console.log(`\n✓ Generated ${icnsPath} successfully!`);
  } catch (error) {
    console.error('Error generating .icns:', error);
    process.exit(1);
  }
}

generateIcns();

