/**
 * Test Express application setup
 * Creates a configured Express app instance for testing endpoints
 */

import express, { Express } from 'express';
import multer from 'multer';
import { FocusingManagerRouter } from '../../src/routes/routes';

/**
 * Create and configure Express app for testing
 * Matches production configuration from src/index.ts
 */
export function createTestApp(): Express {
  const app = express();
  
  // Configure multer for multipart/form-data support (matches production)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  });
  
  // Apply multer middleware to focus endpoint (matches production)
  app.use("/focus", upload.fields([
    { name: 'epi', maxCount: 1 },
    { name: 'ips', maxCount: 1 },
    { name: 'pv', maxCount: 1 }
  ]));
  
  // Match production middleware
  app.use(express.json({ limit: '50mb' }));
  
  // Add routes
  app.use("/", FocusingManagerRouter);
  
  return app;
}
