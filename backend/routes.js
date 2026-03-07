const express = require('express');
const router = express.Router();
const aiPrediction = require('./ai_prediction');

router.get('/predictions', async (req, res) => {
    try {
        const predictions = await aiPrediction.getPredictions();
        res.json(predictions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/analyze', async (req, res) => {
    try {
        const result = await aiPrediction.analyze(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
