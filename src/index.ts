import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import { FocusingManagerRouter } from "./routes/routes";

const PORT = parseInt(process.env.SERVER_PORT as string) || 3000;

const app = express();

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
