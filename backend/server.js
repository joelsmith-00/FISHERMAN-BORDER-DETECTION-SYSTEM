/**
 * Marine Guardian AI - Local API Gateway Simulation
 * 
 * Architecture: Modular Lambda-style backend
 * 
 * Instructions to run:
 * 1. Navigate to the backend folder:
 *    cd backend
 * 
 * 2. Initialize npm (if not already done):
 *    npm init -y
 * 
 * 3. Install dependencies:
 *    npm install express cors body-parser
 * 
 * 4. Start the server:
 *    node server.js
 * 
 * The server will start on port 5000.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import Lambda function
const processBoatData = require('./lambda/processBoatData');

const app = express();
const PORT = process.env.PORT || 5000;

// =====================================================
// MIDDLEWARE
// =====================================================

// Enable CORS for all origins
app.use(cors());

// Parse JSON request bodies
app.use(bodyParser.json());

// =====================================================
// IN-MEMORY DATA STORES
// =====================================================

// Store latest vessel data
let vesselList = [];

// Store generated alerts
let alertHistory = [];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Update vessel in the vessel list (or add if new)
 */
function updateVesselList(vesselData) {
    const existingIndex = vesselList.findIndex(v => v.boatId === vesselData.boatId);
    
    if (existingIndex >= 0) {
        vesselList[existingIndex] = vesselData;
    } else {
        vesselList.push(vesselData);
    }
    
    // Keep only last 50 vessels
    if (vesselList.length > 50) {
        vesselList = vesselList.slice(-50);
    }
}

/**
 * Add alert to history
 */
function addAlert(severity, boatId, message) {
    const alert = {
        id: `ALERT-${Date.now()}`,
        severity,
        boatId,
        message,
        timestamp: new Date().toISOString()
    };
    
    alertHistory.push(alert);
    
    // Keep only last 100 alerts
    if (alertHistory.length > 100) {
        alertHistory = alertHistory.slice(-100);
    }
    
    console.log(`[${severity}] ${boatId}: ${message}`);
}

// =====================================================
// REST API ENDPOINTS
// =====================================================

/**
 * POST /updateBoatLocation
 * Receives vessel data and processes it through Lambda function
 */
app.post('/updateBoatLocation', (req, res) => {
    try {
        const { boatId, latitude, longitude, speed, heading } = req.body;
        
        // Validate required fields
        if (!boatId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['boatId', 'latitude', 'longitude'],
                optional: ['speed', 'heading']
            });
        }
        
        // Process the boat data through Lambda function
        const result = processBoatData({
            boatId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            speed: parseFloat(speed) || 0,
            heading: parseFloat(heading) || 0
        });
        
        // Store result in vessel list
        updateVesselList({
            boatId: result.boatId,
            latitude: result.latitude,
            longitude: result.longitude,
            speed: result.speed,
            heading: result.heading,
            riskLevel: result.riskLevel,
            distanceToBorder: result.distanceToBorder,
            predictedCrossingMinutes: result.predictedCrossingMinutes,
            suggestedDirection: result.suggestedDirection,
            lastUpdate: result.timestamp
        });
        
        // Generate alerts if risk is WARNING or DANGER
        if (result.shouldAlert) {
            addAlert(result.riskLevel, result.boatId, result.prediction);
        }
        
        console.log(`[UPDATE] ${boatId} at (${latitude}, ${longitude}) - Risk: ${result.riskLevel}`);
        
        res.json(result);
        
    } catch (error) {
        console.error('Error processing boat location:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /vessels
 * Returns the current vessel list with latest positions
 */
app.get('/vessels', (req, res) => {
    res.json({
        count: vesselList.length,
        vessels: vesselList,
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /alerts
 * Returns the alert history
 */
app.get('/alerts', (req, res) => {
    // Optional: filter by severity
    const { severity, limit } = req.query;
    
    let filteredAlerts = alertHistory;
    
    if (severity) {
        filteredAlerts = filteredAlerts.filter(a => a.severity === severity.toUpperCase());
    }
    
    if (limit) {
        filteredAlerts = filteredAlerts.slice(-parseInt(limit));
    }
    
    res.json({
        count: filteredAlerts.length,
        alerts: filteredAlerts,
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Marine Guardian AI API',
        architecture: 'Lambda-style modular',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /
 * Root endpoint with API information
 */
app.get('/', (req, res) => {
    res.json({
        name: 'Marine Guardian AI - Local API Gateway',
        version: '1.1.0',
        architecture: 'Modular Lambda Simulation',
        endpoints: {
            'POST /updateBoatLocation': 'Update vessel position and get risk assessment',
            'GET /vessels': 'Get all tracked vessels',
            'GET /alerts': 'Get alert history (optional: ?severity=WARNING&limit=10)',
            'GET /health': 'Health check'
        },
        lambdaFunctions: {
            'processBoatData': 'Analyzes vessel data and generates risk assessment'
        },
        documentation: 'https://github.com/marine-guardian-ai'
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(50));
    console.log('  Marine Guardian API running on port ' + PORT);
    console.log('='.repeat(50));
    console.log('');
    console.log('Architecture: Lambda-style modular backend');
    console.log('');
    console.log('Lambda Functions:');
    console.log('  - processBoatData (./lambda/processBoatData.js)');
    console.log('');
    console.log('Available endpoints:');
    console.log('  POST /updateBoatLocation - Update vessel position');
    console.log('  GET  /vessels            - Get all vessels');
    console.log('  GET  /alerts             - Get alert history');
    console.log('  GET  /health             - Health check');
    console.log('');
    console.log('Server ready to accept connections...');
    console.log('');
});
