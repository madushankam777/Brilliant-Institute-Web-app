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

const sessionRoutes = require('./modules/session/session.routes'); // placeholder login only
const attendanceRoutes = require('./modules/attendance/attendance.routes');
const paymentRoutes = require('./modules/payment/payment.routes');
const paymentController = require('./modules/payment/payment.controller');

const app = express();

app.set('trust proxy', config.trustProxy);

app.use(helmet());

app.use(
  cors({
    // CLIENT_ORIGIN can list more than one allowed origin (comma-separated) -
    // e.g. localhost plus a LAN IP for testing from other devices. Still an
    // explicit whitelist check, never "*", per OWASP CORS guidance.
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

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// --- PayHere payment notification (webhook) ---------------------------------
// Mounted ahead of the rate limiter and the CSRF guard on purpose: this is a
// server-to-server POST from PayHere, so it carries no session cookie and no
// X-Requested-With header, and it must not be throttled away when several
// payments settle at once. It is form-encoded rather than JSON. What makes it
// safe is the md5 signature check inside the service - an unsigned request is
// ignored without touching a single row.
app.post(
  '/api/payments/payhere/notify',
  express.urlencoded({ extended: false, limit: '32kb' }),
  paymentController.handlePayHereNotification
);

app.use(apiLimiter);
app.use(csrfGuard);

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running.' });
});

app.use('/api/session', sessionRoutes); 
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
