// this module's own small API - the combined site uses server/src/app.js
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

// create the web server
const app = express();

// behind a proxy or tunnel, trust it for the real visitor address
app.set('trust proxy', config.trustProxy);

// standard security headers
app.use(helmet());

// CORS - only our own website may call the API (with cookies)
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

// read JSON request bodies (max 100 KB) and cookies
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// log every request
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

// where PayPal sends the payer back (a browser redirect, not an API call).
// Public for the same reason as above - it carries no session cookie. What
// makes it safe is that the money is confirmed by asking PayPal directly.
app.get('/api/payments/paypal/return', paymentController.payPalReturn);
app.get('/api/payments/paypal/cancel', paymentController.payPalCancel);

// rate limit and CSRF check for every request below this line
app.use(apiLimiter);
app.use(csrfGuard);

// health check - is the API up? (returns no data)
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running.' });
});

// this module's routes
app.use('/api/session', sessionRoutes); 
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);

// unknown address gives a 404, any other error gives a JSON error reply
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
