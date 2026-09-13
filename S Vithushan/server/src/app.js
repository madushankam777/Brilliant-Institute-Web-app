const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('../../../shared/server/src/config/env');
const { apiLimiter } = require('../../../shared/server/src/middleware/rateLimiters');
const csrfGuard = require('../../../shared/server/src/middleware/csrfGuard');
const { notFoundHandler, errorHandler } = require('../../../shared/server/src/middleware/errorHandler');

const sessionRoutes = require('./modules/session/session.routes');
const adminRoutes = require('./modules/admin/admin.routes');

const app = express();

app.set('trust proxy', config.trustProxy);
app.use(helmet());

app.use(
  cors({
    // CLIENT_ORIGIN can list more than one allowed origin (comma-separated) -
    // e.g. localhost plus a LAN IP for testing from other devices. Still an
    // explicit whitelist check, never "*", per OWASP CORS guidance.
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

app.use(apiLimiter);
app.use(csrfGuard);

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running.' });
});

app.use('/api/session', sessionRoutes); // placeholder login only
app.use('/api', adminRoutes); // /api/admin/* + /api/announcements

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
