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

const sessionRoutes = require('./modules/session/session.routes');
const attendanceRoutes = require('./modules/attendance/attendance.routes');
const paymentRoutes = require('./modules/payment/payment.routes');
const paymentController = require('./modules/payment/payment.controller');

const app = express();

app.set('trust proxy', config.trustProxy);

app.use(helmet());

// CORS - only our own website may call the API (with cookies)
app.use(
  cors({
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

app.post(
  '/api/payments/payhere/notify',
  express.urlencoded({ extended: false, limit: '32kb' }),
  paymentController.handlePayHereNotification
);

app.get('/api/payments/paypal/return', paymentController.payPalReturn);
app.get('/api/payments/paypal/cancel', paymentController.payPalCancel);

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
