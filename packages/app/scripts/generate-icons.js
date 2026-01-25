/**
 * Icon Generator Script
 * Generates platform-specific icons from the base icon.icns file
 *
 * Usage: npm run icons:generate
 *
 * Requirements:
 * - macOS (uses sips command for PNG conversion)
 * - png2icons npm package (for ICO generation)
 *
 * Input: assets/icon.icns (macOS icon file)
 * Output:
 *   - assets/icon.png (for Linux)
 *   - assets/icon.ico (for Windows)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const ICNS_FILE = path.join(ASSETS_DIR, 'icon.icns');
const PNG_FILE = path.join(ASSETS_DIR, 'icon.png');
const ICO_FILE = path.join(ASSETS_DIR, 'icon.ico');

console.log('🎨 Generating platform icons...\n');

// Check if source icon exists
if (!fs.existsSync(ICNS_FILE)) {
  console.error('❌ Error: icon.icns not found in assets folder');
  console.error('   Please create a macOS icon file first.');
  process.exit(1);
}

// Generate PNG from ICNS (macOS only - uses sips)
console.log('📷 Converting icon.icns to icon.png...');
try {
  if (process.platform === 'darwin') {
    execSync(`sips -s format png "${ICNS_FILE}" --out "${PNG_FILE}"`, {
      stdio: 'pipe',
    });
    console.log('   ✅ icon.png created\n');
  } else {
    console.log('   ⚠️  Skipping PNG generation (requires macOS sips command)');
    console.log('   💡 Copy icon.png manually or run on macOS\n');
  }
} catch (error) {
  console.error('   ❌ Failed to create PNG:', error.message);
}

// Generate ICO from PNG
console.log('🪟 Converting icon.png to icon.ico...');
try {
  if (!fs.existsSync(PNG_FILE)) {
    throw new Error('icon.png not found - cannot create ICO');
  }

  const png2icons = require('png2icons');
  const input = fs.readFileSync(PNG_FILE);
  const output = png2icons.createICO(input, png2icons.BICUBIC, 0, true);

  if (output) {
    fs.writeFileSync(ICO_FILE, output);
    console.log('   ✅ icon.ico created\n');
  } else {
    throw new Error('png2icons returned null');
  }
} catch (error) {
  console.error('   ❌ Failed to create ICO:', error.message);
}

// Summary
console.log('📁 Generated icons:');
const icons = ['icon.icns', 'icon.png', 'icon.ico'];
icons.forEach((icon) => {
  const iconPath = path.join(ASSETS_DIR, icon);
  if (fs.existsSync(iconPath)) {
    const stats = fs.statSync(iconPath);
    const size = (stats.size / 1024).toFixed(1);
    console.log(`   ✅ ${icon} (${size} KB)`);
  } else {
    console.log(`   ❌ ${icon} (missing)`);
  }
});

console.log('\n✨ Done!');
