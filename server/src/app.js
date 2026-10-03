const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('../../shared/server/src/config/env');
const { isTrustedDevOrigin } = require('../../shared/server/src/utils/isTrustedDevOrigin');
const { apiLimiter } = require('../../shared/server/src/middleware/rateLimiters');
const csrfGuard = require('../../shared/server/src/middleware/csrfGuard');
const { notFoundHandler, errorHandler } = require('../../shared/server/src/middleware/errorHandler');
const { UPLOADS_ROOT_DIR } = require('../../shared/server/src/utils/resolveUploadPath');
const { sendUpload } = require('../../shared/server/src/utils/fileStore');
const asyncHandler = require('../../shared/server/src/utils/asyncHandler');

const authRoutes = require('../../N Danushika/server/src/modules/auth/auth.routes');
const attendanceRoutes = require('../../M T Madushanka/server/src/modules/attendance/attendance.routes');
const paymentRoutes = require('../../M T Madushanka/server/src/modules/payment/payment.routes');
const paymentController = require('../../M T Madushanka/server/src/modules/payment/payment.controller');
const courseRoutes = require('../../C D Kumanan/server/src/modules/course/course.routes');
const feedbackRoutes = require('../../H A S Hapuarachchi/server/src/modules/feedback/feedback.routes');
const contactRoutes = require('../../H A S Hapuarachchi/server/src/modules/feedback/contact.routes');
const adminRoutes = require('../../S Vithushan/server/src/modules/admin/admin.routes');
const reportRoutes = require('../../S Vithushan/server/src/modules/reports/reports.routes');
const analyticsRoutes = require('../../S Vithushan/server/src/modules/reports/analytics.routes');

const app = express();

app.set('trust proxy', config.trustProxy);

app.use(helmet());

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
      // no CORS headers - the browser blocks the page from reading the reply
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// old profile pictures - only until they are moved into MySQL
app.use(
  '/uploads/profile-pictures',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(UPLOADS_ROOT_DIR, 'profile-pictures'), { dotfiles: 'deny', index: false })
);

app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// PayHere's server-to-server payment notification
app.post(
  '/api/payments/payhere/notify',
  express.urlencoded({ extended: false, limit: '32kb' }),
  paymentController.handlePayHereNotification
);

app.use(apiLimiter);
app.use(csrfGuard);

// profile pictures stored in MySQL (public, like any avatar)
app.get(
  '/api/files/:publicId',
  asyncHandler(async (req, res) => {
    await sendUpload(res, `/api/files/${req.params.publicId}`, 'PROFILE_PICTURE');
  })
);

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running.' });
});

app.use('/api/auth', authRoutes); // Registration & Login (N Danushika)
app.use('/api/attendance', attendanceRoutes); // Attendance (M T Madushanka)
app.use('/api/payments', paymentRoutes); // Payments (M T Madushanka)
app.use('/api/courses', courseRoutes); // Course Management (C D Kumanan)
app.use('/api/feedback', feedbackRoutes); // Feedback & Complaint (H A S Hapuarachchi)
app.use('/api/contact', contactRoutes); // Contact Us form + Admin inbox (H A S Hapuarachchi)
app.use('/api/admin/reports', reportRoutes); // Reports + PDF / Excel downloads (S Vithushan)
app.use('/api/admin/analytics', analyticsRoutes); // Analytics dashboard data (S Vithushan)
app.use('/api', adminRoutes); // Admin, Notifications & Announcements (S Vithushan) - /api/admin/* + /api/announcements

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
