var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
require('dotenv').config({ quiet: true });

// Initialize Database Connection
require('./services/database');

var indexRouter = require('./routes/index');

var app = express();

app.use(cors());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Root route for healthcheck / Vercel ping
app.get('/', (req, res) => {
  res.status(200).json({
    status: true,
    message: 'Backend API is running successfully'
  });
});

app.use('/api', indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  const status = err.status || 500;
  if (req.originalUrl.startsWith('/api') || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(status).json({
      status: false,
      message: err.message || 'Internal Server Error'
    });
  }

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(status);
  res.render('error');
});

// Port configuration and Server Startup
const PORT = process.env.PORT || 3001;

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

