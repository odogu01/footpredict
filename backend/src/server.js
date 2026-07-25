require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/validation');

const teamsRouter = require('./routes/teams');
const predictionRouter = require('./routes/prediction');
const statsRouter = require('./routes/stats');
const fixturesRouter = require('./routes/fixtures');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: true,
  methods: ['GET', 'POST']
}));
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/teams', teamsRouter);
app.use('/api/predict', predictionRouter);
app.use('/api/stats', statsRouter);
app.use('/api/fixtures', fixturesRouter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'FootPredict API is running', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`FootPredict API server running on http://localhost:${PORT}`);
});

module.exports = app;
