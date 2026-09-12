const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('../../shared/server/src/config/env');
const { apiLimiter } = require('../../shared/server/src/middleware/rateLimiters');
const csrfGuard = require('../../shared/server/src/middleware/csrfGuard');
const { notFoundHandler, errorHandler } = require('../../shared/server/src/middleware/errorHandler');
const { UPLOADS_ROOT_DIR } = require('../../shared/server/src/middleware/upload');

const authRoutes = require('../../N Danushika/server/src/modules/auth/auth.routes');
const attendanceRoutes = require('../../M T Madushanka/server/src/modules/attendance/attendance.routes');
const paymentRoutes = require('../../M T Madushanka/server/src/modules/payment/payment.routes');
const courseRoutes = require('../../C D Kumanan/server/src/modules/course/course.routes');
const feedbackRoutes = require('../../H A S Hapuarachchi/server/src/modules/feedback/feedback.routes');
const adminRoutes = require('../../S Vithushan/server/src/modules/admin/admin.routes');

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

app.use(
  '/uploads/profile-pictures',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(UPLOADS_ROOT_DIR, 'profile-pictures'))
);

app.use(morgan(config.isProduction ? 'combined' : 'dev'));

app.use(apiLimiter);
app.use(csrfGuard);

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running.' });
});

app.use('/api/auth', authRoutes); // Registration & Login (N Danushika)
app.use('/api/attendance', attendanceRoutes); // Attendance (M T Madushanka)
app.use('/api/payments', paymentRoutes); // Payments (M T Madushanka)
app.use('/api/courses', courseRoutes); // Course Management (C D Kumanan)
app.use('/api/feedback', feedbackRoutes); // Feedback & Complaint (H A S Hapuarachchi)
app.use('/api', adminRoutes); // Admin, Notifications & Announcements (S Vithushan) - /api/admin/* + /api/announcements

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
