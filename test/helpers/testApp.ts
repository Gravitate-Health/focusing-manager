/**
 * Test Express application setup
 * Creates a configured Express app instance for testing endpoints
 */

import express, { Express } from 'express';
import { FocusingManagerRouter } from '../../src/routes/routes';

/**
 * Create and configure Express app for testing
 * Matches production configuration from src/index.ts
 */
export function createTestApp(): Express {
  const app = express();
  
  // Match production middleware
  app.use(express.json({ limit: '50mb' }));
  
  // Add routes
  app.use("/", FocusingManagerRouter);
  
  return app;
}
