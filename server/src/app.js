// Express app: middleware, routes, error handlers
// This is the combined site - it mounts each person's actual route
// modules directly from their own folder (no copies), so there is one
// running product with one login, and each person's code stays owned in
// their own folder.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('../../shared/server/src/config/env');
const { apiLimiter } = require('../../shared/server/src/middleware/rateLimiters');
const csrfGuard = require('../../shared/server/src/middleware/csrfGuard');
const { notFoundHandler, errorHandler } = require('../../shared/server/src/middleware/errorHandler');

const authRoutes = require('../../N Danushika/server/src/modules/auth/auth.routes');
const attendanceRoutes = require('../../M T Madushanka/server/src/modules/attendance/attendance.routes');
const paymentRoutes = require('../../M T Madushanka/server/src/modules/payment/payment.routes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

app.use(
  cors({
    origin: config.clientOrigin,
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

app.use('/api/auth', authRoutes); // Registration & Login (N Danushika)
app.use('/api/attendance', attendanceRoutes); // Attendance (M T Madushanka)
app.use('/api/payments', paymentRoutes); // Payments (M T Madushanka)

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
