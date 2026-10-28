const mongoose = require('mongoose');

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  const mongoURI = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/backend';

  try {
    const conn = await mongoose.connect(mongoURI);
    console.log(`Database connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('Database connection error:', error.message);
  }
};

// Establish connection
connectDB();

// Connection event listeners
mongoose.connection.on('disconnected', () => {
  console.warn('Database disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('Database error:', err.message);
});

module.exports = mongoose;
