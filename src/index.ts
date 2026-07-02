import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import { FocusingManagerRouter } from "./routes/routes";

const PORT = parseInt(process.env.SERVER_PORT as string) || 3000;
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || "");

const app = express();

function normalizeBasePath(basePath: string): string {
  const trimmedPath = basePath.trim();

  if (!trimmedPath || trimmedPath === "/") {
    return "";
  }

  const prefixedPath = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  return prefixedPath.endsWith("/") ? prefixedPath.slice(0, -1) : prefixedPath;
}

function shouldStripBasePath(url: string, basePath: string): boolean {
  if (!basePath || !url.startsWith(basePath)) {
    return false;
  }

  return url.length === basePath.length || url.charAt(basePath.length) === "/";
}

// Strip external base path prefix before middleware/route matching.
app.use((req, _res, next) => {
  if (shouldStripBasePath(req.url, BASE_PATH)) {
    req.url = req.url.slice(BASE_PATH.length) || "/";
  }

  next();
});

// Configure multer for in-memory storage (multipart/form-data support)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Apply multer middleware to focus endpoint for multipart support
// This allows sending ePI, IPS, and PV in different formats (JSON, XML, TTL)
app.use("/focus", upload.fields([
  { name: 'epi', maxCount: 1 },
  { name: 'ips', maxCount: 1 },
  { name: 'pv', maxCount: 1 }
]));

// JSON body parser for backward compatibility (existing clients)
app.use(express.json( {limit: '50mb'} ));


app.use((req, _res, next) => {
  if (req.originalUrl != "/metrics") {
    console.log(`\n\n${new Date().toLocaleString()} | Method: ${req.method} | URL: ${req.originalUrl}`);
  }
  next()
})

app.use("/", FocusingManagerRouter);
app.listen(PORT, () => {
  console.log(`Focusing manager listening on port ${PORT}`);
});
