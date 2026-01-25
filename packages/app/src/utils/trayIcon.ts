import { nativeImage, NativeImage } from 'electron';
import { TRAY_ICON_SIZE } from './constants';

const isMac = process.platform === 'darwin';

function setPixel(
  buffer: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  alpha: number,
  isBackground = false
): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const idx = (Math.floor(y) * width + Math.floor(x)) * 4;

  if (isMac) {
    buffer[idx] = 0;
    buffer[idx + 1] = 0;
    buffer[idx + 2] = 0;
  } else {
    if (isBackground) {
      buffer[idx] = 30;
      buffer[idx + 1] = 30;
      buffer[idx + 2] = 30;
    } else {
      buffer[idx] = 255;
      buffer[idx + 1] = 255;
      buffer[idx + 2] = 255;
    }
  }
  buffer[idx + 3] = Math.min(255, Math.floor(alpha * 255));
}

function drawRoundedBackground(
  buffer: Buffer,
  width: number,
  height: number,
  padding: number,
  radius: number
): void {
  for (let y = padding; y < height - padding; y++) {
    for (let x = padding; x < width - padding; x++) {
      let alpha = 1;

      if (x < padding + radius && y < padding + radius) {
        const dist = Math.sqrt((x - (padding + radius)) ** 2 + (y - (padding + radius)) ** 2);
        if (dist > radius) continue;
        if (dist > radius - 1) alpha = radius - dist;
      }
      else if (x > width - padding - radius && y < padding + radius) {
        const dist = Math.sqrt((x - (width - padding - radius)) ** 2 + (y - (padding + radius)) ** 2);
        if (dist > radius) continue;
        if (dist > radius - 1) alpha = radius - dist;
      }
      else if (x < padding + radius && y > height - padding - radius) {
        const dist = Math.sqrt((x - (padding + radius)) ** 2 + (y - (height - padding - radius)) ** 2);
        if (dist > radius) continue;
        if (dist > radius - 1) alpha = radius - dist;
      }
      else if (x > width - padding - radius && y > height - padding - radius) {
        const dist = Math.sqrt((x - (width - padding - radius)) ** 2 + (y - (height - padding - radius)) ** 2);
        if (dist > radius) continue;
        if (dist > radius - 1) alpha = radius - dist;
      }

      setPixel(buffer, width, height, x, y, alpha * 0.85, true);
    }
  }
}

function drawCircle(
  buffer: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  filled = false
): void {
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (filled) {
        if (dist <= r) setPixel(buffer, width, height, x, y, 1);
        else if (dist <= r + 1) setPixel(buffer, width, height, x, y, r + 1 - dist);
      } else {
        const thickness = 1.2;
        const inner = r - thickness / 2;
        const outer = r + thickness / 2;
        if (dist >= inner && dist <= outer) {
          const alpha = Math.min(1, Math.max(0, 1 - Math.abs(dist - r) / (thickness / 2)));
          setPixel(buffer, width, height, x, y, alpha);
        }
      }
    }
  }
}

function drawLine(
  buffer: Buffer,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 1.5
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(length * 2);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;

    for (let ox = -thickness; ox <= thickness; ox++) {
      for (let oy = -thickness; oy <= thickness; oy++) {
        const dist = Math.sqrt(ox * ox + oy * oy);
        if (dist <= thickness) {
          const alpha = 1 - dist / thickness;
          setPixel(buffer, width, height, x + ox, y + oy, alpha);
        }
      }
    }
  }
}

export function createTrayIcon(): NativeImage {
  const width = TRAY_ICON_SIZE;
  const height = TRAY_ICON_SIZE;
  const channels = 4;
  const buffer = Buffer.alloc(width * height * channels);

  if (!isMac) {
    drawRoundedBackground(buffer, width, height, 0, 3);
  }

  // New PR Manager logo - two connected nodes
  // Top-left circle
  drawCircle(buffer, width, height, 5, 5, 2.5, true);
  // Bottom-right circle
  drawCircle(buffer, width, height, 13, 13, 2.5, true);
  // Path from top-left going down then right
  drawLine(buffer, width, height, 5, 8, 5, 11, 1.3);
  drawLine(buffer, width, height, 5, 11, 8, 14, 1.3);
  // Path from bottom-right going up then left
  drawLine(buffer, width, height, 13, 10, 13, 7, 1.3);
  drawLine(buffer, width, height, 13, 7, 10, 4, 1.3);

  const icon = nativeImage.createFromBuffer(buffer, { width, height });

  if (isMac) {
    icon.setTemplateImage(true);
  }

  return icon;
}

function drawArc(
  buffer: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  thickness = 1.5
): void {
  const steps = 50;
  const angleStep = (endAngle - startAngle) / steps;

  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + angleStep * i;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    for (let ox = -thickness; ox <= thickness; ox++) {
      for (let oy = -thickness; oy <= thickness; oy++) {
        const dist = Math.sqrt(ox * ox + oy * oy);
        if (dist <= thickness) {
          const alpha = 1 - dist / thickness;
          setPixel(buffer, width, height, x + ox, y + oy, alpha);
        }
      }
    }
  }
}

function drawArrowhead(
  buffer: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  angle: number,
  size: number
): void {
  const angle1 = angle + Math.PI * 0.75;
  const angle2 = angle - Math.PI * 0.75;

  drawLine(buffer, width, height, x, y, x + size * Math.cos(angle1), y + size * Math.sin(angle1), 1.3);
  drawLine(buffer, width, height, x, y, x + size * Math.cos(angle2), y + size * Math.sin(angle2), 1.3);
}

export function createSyncingIconFrame(rotation = 0): NativeImage {
  const width = TRAY_ICON_SIZE;
  const height = TRAY_ICON_SIZE;
  const channels = 4;
  const buffer = Buffer.alloc(width * height * channels);

  if (!isMac) {
    drawRoundedBackground(buffer, width, height, 0, 3);
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = 5;

  const rot = rotation;

  drawArc(buffer, width, height, cx, cy, r, -Math.PI * 0.7 + rot, Math.PI * 0.2 + rot, 1.3);
  drawArc(buffer, width, height, cx, cy, r, Math.PI * 0.3 + rot, Math.PI * 1.2 + rot, 1.3);

  const arrowX1 = cx + r * Math.cos(Math.PI * 0.2 + rot);
  const arrowY1 = cy + r * Math.sin(Math.PI * 0.2 + rot);
  drawArrowhead(buffer, width, height, arrowX1, arrowY1, Math.PI * 0.7 + rot, 3);

  const arrowX2 = cx + r * Math.cos(Math.PI * 1.2 + rot);
  const arrowY2 = cy + r * Math.sin(Math.PI * 1.2 + rot);
  drawArrowhead(buffer, width, height, arrowX2, arrowY2, Math.PI * 1.7 + rot, 3);

  const icon = nativeImage.createFromBuffer(buffer, { width, height });

  if (isMac) {
    icon.setTemplateImage(true);
  }

  return icon;
}

export function createSyncingIconFrames(frameCount = 8): NativeImage[] {
  const frames: NativeImage[] = [];
  for (let i = 0; i < frameCount; i++) {
    const rotation = (i / frameCount) * Math.PI * 2;
    frames.push(createSyncingIconFrame(rotation));
  }
  return frames;
}
