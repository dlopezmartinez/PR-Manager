import { createApp } from '../../src/app.js';
import type { Express } from 'express';

export function getTestApp(): Express {
  return createApp();
}
