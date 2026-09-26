const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('../../../shared/server/src/config/env');
const { isTrustedDevOrigin } = require('../../../shared/server/src/utils/isTrustedDevOrigin');
const { apiLimiter } = require('../../../shared/server/src/middleware/rateLimiters');
const csrfGuard = require('../../../shared/server/src/middleware/csrfGuard');
const { notFoundHandler, errorHandler } = require('../../../shared/server/src/middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');

const app = express();

// We run behind a proxy in production
app.set('trust proxy', config.trustProxy);

// Adds standard security headers to every response.
app.use(helmet());

// Only allow our own frontend to call this API (with cookies), never "*".
app.use(
  cors({
    // CLIENT_ORIGIN can list more than one allowed origin
    origin(origin, callback) {
      if (
        !origin ||
        config.clientOrigins.includes(origin) ||
        isTrustedDevOrigin(origin, config.isProduction)
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  })
);

// Parse JSON bodies (with a small size limit) and cookies.
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Log every request.
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// Rate limiting and CSRF protection apply to every request.
app.use(apiLimiter);
app.use(csrfGuard);

// Simple health check, no sensitive data.
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running.' });
});

app.use('/api/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
