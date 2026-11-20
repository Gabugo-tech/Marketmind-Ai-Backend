import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth.routes';
import inventoryRoutes from './routes/inventory.routes';
import salesRoutes from './routes/sales.routes';
import purchasesRoutes from './routes/purchases.routes';
import analyticsRoutes from './routes/analytics.routes';
import forecastingRoutes from './routes/forecasting.routes';
import assistantRoutes from './routes/assistant.routes';
import notificationsRoutes from './routes/notifications.routes';
import businessRoutes from './routes/business.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// AI assistant has stricter rate limit
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { success: false, message: 'Too many AI requests. Please wait a moment.' },
});
app.use('/api/assistant', aiLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ── Logging ───────────────────────────────────────────────────────────────────
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'MarketMind AI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/forecasting', forecastingRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/admin', adminRoutes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n🚀 MarketMind AI Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Frontend: ${config.frontendUrl}`);
  console.log(`💡 Health: http://localhost:${PORT}/health\n`);

  // ── Keep-alive self-ping (production only) ──────────────────────────────
  // Railway free tier sleeps after 15 minutes of inactivity, causing a
  // 5–15 second cold start on the next request. Pinging /health every
  // 14 minutes keeps the process warm at zero cost.
  if (config.nodeEnv === 'production') {
    const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes
    const selfUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`
      : `http://localhost:${PORT}/health`;

    setInterval(async () => {
      try {
        const { default: https } = await import('https');
        const { default: http } = await import('http');
        const client = selfUrl.startsWith('https') ? https : http;
        client.get(selfUrl, (res) => {
          res.resume(); // drain the response so the socket closes
          console.log(`[keep-alive] ping → ${res.statusCode}`);
        }).on('error', (err) => {
          console.warn(`[keep-alive] ping failed: ${err.message}`);
        });
      } catch {
        // non-fatal — just log and continue
      }
    }, PING_INTERVAL_MS);

    console.log(`⏱  Keep-alive ping scheduled every 14 min → ${selfUrl}`);
  }
});

export default app;
