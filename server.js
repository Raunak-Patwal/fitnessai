require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");

// Security
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Rejection:', err.message);
  // Close server & exit process
  process.exit(1);
});

const app = express();

app.use(express.json({
  limit: '200kb' // adjust as needed
}));

// Enable CORS
app.use(cors());

// Basic Security Headers
app.use(helmet());

// Rate Limit (100 requests per 10 minutes)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Routes (keep order)
app.use("/exercises", require("./routes/exercises"));
app.use("/auth", require("./routes/auth"));
app.use("/workouts", require("./routes/workouts"));
app.use("/analytics", require("./routes/analytics"));
app.use("/program", require("./routes/program"));
app.use("/admin", require("./routes/admin"));
app.use("/users", require("./routes/users"));
app.use("/period", require("./routes/periodMode"));

// Global error handler for JSON parse errors from body-parser
app.use((err, req, res, next) => {
  // Typical JSON parse error from body-parser is a SyntaxError with status 400
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('=== JSON Parse Error (body-parser) ===');
    console.error('Error message:', err.message);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

// Health route
app.get("/", (req, res) => {
  res.json({ message: "Fitness AI Backend Running Securely 🚀" });
});

// Connect to DB and start server
(async () => {
  await connectDB();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
})();
