import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createApiRoutes } from "./src/routes/apiRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;
const __filename = fileURLToPath(import.meta.url);
const publicDir = path.join(dirname(__filename), "public");
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",");

// 1. Helmet: Protect against well-known web vulnerabilities by setting HTTP headers appropriately
// We disable crossOriginEmbedderPolicy so images from other domains can load if needed
app.use(helmet({ crossOriginEmbedderPolicy: false }));

// 2. Rate Limiting: Limit each IP to 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { success: false, message: "Terlalu banyak permintaan dari IP ini, coba lagi dalam 1 menit (Anti-Spam/DDoS protection active)." },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiter to all API routes
app.use('/api', apiLimiter);

app.use(
  cors({
    origin: allowedOrigins?.includes("*") ? "*" : allowedOrigins || [],
    methods: ["GET", "POST", "OPTIONS"],
  })
);

// Custom CORS middleware - only block requests WITH an origin that's not in the whitelist
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow: no origin (direct browser nav, same-origin), wildcard, or whitelisted origin
  if (
    !origin ||                          // direct browser request (no origin header)
    !allowedOrigins ||                  // no whitelist set
    allowedOrigins.includes("*") ||     // wildcard
    allowedOrigins.includes(origin)     // explicitly whitelisted
  ) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return next();
  }
  res.status(403).json({ success: false, message: "Forbidden: Origin not allowed" });
});

app.use(express.static(publicDir, { redirect: false }));
app.use(express.json());

const jsonResponse = (res, data, status = 200) =>
  res.status(status).json({ success: true, results: data });

const jsonError = (res, message = "Internal server error", status = 500) =>
  res.status(status).json({ success: false, message });

createApiRoutes(app, jsonResponse, jsonError);

app.use((req, res) => {
  const filePath = path.join(publicDir, "404.html");
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(500).send("Error loading 404 page.");
  }
});

app.listen(PORT, () => {
  console.info(`Listening at ${PORT}`);
});
