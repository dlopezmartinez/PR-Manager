const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create a 1024x1024 PNG icon using Node.js canvas-like approach
// We'll create an SVG first, then convert it

const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6e5494"/>
      <stop offset="100%" style="stop-color:#24292e"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect x="64" y="64" width="896" height="896" rx="180" ry="180" fill="url(#bg)" filter="url(#shadow)"/>
  
  <!-- PR Icon - Git merge style -->
  <g transform="translate(512, 512)" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Main vertical line (trunk) -->
    <line x1="-160" y1="-280" x2="-160" y2="280"/>
    
    <!-- Branch merge line -->
    <path d="M -160 -120 Q 0 -120 80 40 Q 160 200 160 280"/>
    
    <!-- Top circle (source commit) -->
    <circle cx="-160" cy="-280" r="60" fill="white"/>
    
    <!-- Middle circle (branch point) -->
    <circle cx="-160" cy="0" r="60" fill="white"/>
    
    <!-- Bottom left circle (main branch) -->
    <circle cx="-160" cy="280" r="60" fill="white"/>
    
    <!-- Bottom right circle (merge point) -->
    <circle cx="160" cy="280" r="60" fill="#58a6ff" stroke="#58a6ff"/>
  </g>
</svg>`;

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');
const iconsetDir = path.join(assetsDir, 'icon.iconset');
const icnsPath = path.join(assetsDir, 'icon.icns');

// Write SVG
fs.writeFileSync(svgPath, iconSvg);
console.log('Created SVG icon');

// Create iconset directory
if (!fs.existsSync(iconsetDir)) {
  fs.mkdirSync(iconsetDir, { recursive: true });
}

// Generate different sizes using sips (macOS built-in)
const sizes = [16, 32, 64, 128, 256, 512, 1024];

try {
  // First convert SVG to PNG using qlmanage or sips workaround
  // We'll use a base PNG approach
  
  // For macOS, we can use the 'qlmanage' command to render SVG to PNG
  const tempPng = path.join(assetsDir, 'icon_1024.png');
  
  try {
    // Try using qlmanage for SVG to PNG conversion
    execSync(`qlmanage -t -s 1024 -o "${assetsDir}" "${svgPath}"`, { stdio: 'pipe' });
    const qlOutput = path.join(assetsDir, 'icon.svg.png');
    if (fs.existsSync(qlOutput)) {
      fs.renameSync(qlOutput, tempPng);
    }
  } catch (e) {
    // Fallback: create a simple PNG using base64
    console.log('qlmanage failed, using fallback PNG...');
    
    // Create a simple colored PNG as fallback
    // This is a pre-rendered 256x256 purple PR icon as base64
    const fallbackPng = Buffer.from(
      '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',
      'base64'
    );
    fs.writeFileSync(tempPng, fallbackPng);
  }

  // Check if we have a base PNG
  if (fs.existsSync(tempPng)) {
    // Generate all icon sizes
    for (const size of sizes) {
      const outFile = path.join(iconsetDir, `icon_${size}x${size}.png`);
      const outFile2x = path.join(iconsetDir, `icon_${size/2}x${size/2}@2x.png`);
      
      execSync(`sips -z ${size} ${size} "${tempPng}" --out "${outFile}"`, { stdio: 'pipe' });
      console.log(`Generated ${size}x${size}`);
      
      if (size >= 32) {
        fs.copyFileSync(outFile, outFile2x);
      }
    }
    
    // Create icns using iconutil
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
    console.log('Created icon.icns');
    
    // Cleanup
    fs.rmSync(iconsetDir, { recursive: true });
    fs.unlinkSync(tempPng);
    
    console.log('\nIcon generated successfully at:', icnsPath);
  } else {
    console.error('Failed to create base PNG');
  }
} catch (error) {
  console.error('Error generating icon:', error.message);
}
