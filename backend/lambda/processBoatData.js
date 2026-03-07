/**
 * Marine Guardian AI - AWS Lambda Function Simulation
 * 
 * processBoatData.js
 * 
 * This module simulates an AWS Lambda function that processes
 * vessel tracking data and generates risk assessments.
 * 
 * Designed to be deployable directly to AWS Lambda with minimal changes.
 * 
 * Usage:
 *   const processBoatData = require('./lambda/processBoatData');
 *   const result = processBoatData(boatData);
 */

// =====================================================
// CONFIGURATION CONSTANTS
// =====================================================

// International border line (approximate longitude for Palk Strait)
const BORDER_LONGITUDE = 79.7;

// Risk thresholds (in km)
const SAFE_THRESHOLD = 8;
const WARNING_THRESHOLD = 3;

// Advisory messages by risk level
const ADVISORIES = {
    SAFE: 'Vessel operating within safe zone. Continue monitoring.',
    WARNING: 'Boat approaching international waters. Adjust heading immediately.',
    DANGER: 'CRITICAL: Vessel at high risk of border violation. Immediate course correction required.'
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculate distance to border using Haversine-like approximation
 * Uses longitude difference as approximation for Palk Strait region
 * 
 * @param {number} longitude - Current vessel longitude
 * @returns {number} Distance to border in kilometers
 */
function calculateDistanceToBorder(longitude) {
    // Approximate: 1 degree longitude ≈ 111 km at equator, ~100 km at 9.5°N latitude
    const kmPerDegree = 100;
    const distanceKm = Math.abs(BORDER_LONGITUDE - longitude) * kmPerDegree;
    return distanceKm;
}

/**
 * Calculate Haversine distance between two points
 * 
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees 
 * @returns {number} Radians
 */
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Calculate heading direction suggestion based on current position
 * 
 * @param {number} currentHeading - Current vessel heading in degrees
 * @param {number} longitude - Current longitude
 * @param {number} latitude - Current latitude
 * @returns {string} Suggested direction change
 */
function calculateSuggestedDirection(currentHeading, longitude, latitude) {
    // Determine quadrant relative to safe zone center
    const safeCenterLon = 79.3;
    const safeCenterLat = 9.5;
    
    let direction = '';
    let turnDegrees = 0;
    
    // If vessel is east of safe center, suggest turning west
    if (longitude > safeCenterLon) {
        turnDegrees = Math.floor(Math.random() * 30 + 20);
        direction = 'West';
    } else if (longitude < safeCenterLon - 0.2) {
        turnDegrees = Math.floor(Math.random() * 20 + 10);
        direction = 'East';
    } else {
        // Near center, suggest based on latitude
        if (latitude > safeCenterLat) {
            turnDegrees = Math.floor(Math.random() * 25 + 15);
            direction = 'Southwest';
        } else {
            turnDegrees = Math.floor(Math.random() * 25 + 15);
            direction = 'Northwest';
        }
    }
    
    return `Turn ${turnDegrees}° ${direction}`;
}

/**
 * Calculate predicted border crossing time based on speed and distance
 * 
 * @param {number} distanceKm - Distance to border in km
 * @param {number} speedKnots - Vessel speed in knots
 * @param {number} heading - Vessel heading in degrees
 * @returns {number|null} Estimated crossing time in minutes, or null if not applicable
 */
function calculateCrossingTime(distanceKm, speedKnots, heading) {
    if (speedKnots <= 0) return null;
    
    // Adjust for heading - only count component moving toward border
    // Assume border is roughly east (heading 90°)
    const headingRad = toRadians(heading);
    const eastwardComponent = Math.sin(headingRad);
    
    // If vessel is moving away from border, no crossing predicted
    if (eastwardComponent <= 0) return null;
    
    // Calculate effective speed toward border
    const effectiveSpeedKnots = speedKnots * eastwardComponent;
    
    // Convert knots to km/h (1 knot ≈ 1.852 km/h)
    const speedKmh = effectiveSpeedKnots * 1.852;
    
    if (speedKmh <= 0) return null;
    
    const timeHours = distanceKm / speedKmh;
    const timeMinutes = Math.round(timeHours * 60);
    
    // Cap at reasonable maximum
    return timeMinutes > 999 ? null : timeMinutes;
}

/**
 * Determine risk level based on distance to border
 * 
 * @param {number} distanceKm - Distance to border in km
 * @returns {string} Risk level: 'SAFE', 'WARNING', or 'DANGER'
 */
function determineRiskLevel(distanceKm) {
    if (distanceKm < WARNING_THRESHOLD) {
        return 'DANGER';
    } else if (distanceKm < SAFE_THRESHOLD) {
        return 'WARNING';
    }
    return 'SAFE';
}

/**
 * Generate AI prediction message based on analysis
 * 
 * @param {string} riskLevel - Current risk level
 * @param {number} distanceKm - Distance to border
 * @param {number|null} crossingMinutes - Predicted crossing time
 * @param {string} boatId - Vessel identifier
 * @returns {string} Prediction message
 */
function generatePredictionMessage(riskLevel, distanceKm, crossingMinutes, boatId) {
    if (riskLevel === 'DANGER') {
        if (crossingMinutes !== null && crossingMinutes <= 30) {
            return `CRITICAL: ${boatId} may cross international border in ${crossingMinutes} minutes. Immediate action required.`;
        }
        return `CRITICAL: ${boatId} very close to international border (${distanceKm.toFixed(1)} km). High risk zone.`;
    }
    
    if (riskLevel === 'WARNING') {
        if (crossingMinutes !== null) {
            return `WARNING: ${boatId} may cross international border in ${crossingMinutes} minutes. Course correction advised.`;
        }
        return `WARNING: ${boatId} approaching border (${distanceKm.toFixed(1)} km remaining). Monitor closely.`;
    }
    
    return `${boatId} operating within safe zone. Distance to border: ${distanceKm.toFixed(1)} km.`;
}

// =====================================================
// MAIN LAMBDA FUNCTION
// =====================================================

/**
 * Process boat data - AWS Lambda handler simulation
 * 
 * Analyzes vessel position data and generates comprehensive risk assessment.
 * This function is designed to be AWS Lambda compatible.
 * 
 * @param {Object} boatData - Vessel tracking data
 * @param {string} boatData.boatId - Unique vessel identifier
 * @param {number} boatData.latitude - Current latitude
 * @param {number} boatData.longitude - Current longitude
 * @param {number} boatData.speed - Speed in knots
 * @param {number} boatData.heading - Heading in degrees (0-360)
 * 
 * @returns {Object} Risk assessment result
 */
function processBoatData(boatData) {
    const { boatId, latitude, longitude, speed, heading } = boatData;
    
    // Validate input
    if (!boatId || latitude === undefined || longitude === undefined) {
        throw new Error('Missing required fields: boatId, latitude, longitude');
    }
    
    // Parse numeric values
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const spd = parseFloat(speed) || 0;
    const hdg = parseFloat(heading) || 0;
    
    // Calculate distance to border
    const distanceToBorder = calculateDistanceToBorder(lon);
    
    // Determine risk level
    const riskLevel = determineRiskLevel(distanceToBorder);
    
    // Calculate predicted crossing time
    const predictedCrossingMinutes = calculateCrossingTime(distanceToBorder, spd, hdg);
    
    // Generate suggested direction (only for WARNING and DANGER)
    const suggestedDirection = (riskLevel !== 'SAFE') 
        ? calculateSuggestedDirection(hdg, lon, lat)
        : null;
    
    // Generate advisory message
    const advisory = ADVISORIES[riskLevel];
    
    // Generate detailed prediction message
    const prediction = generatePredictionMessage(riskLevel, distanceToBorder, predictedCrossingMinutes, boatId);
    
    // Build response object
    const result = {
        // Input echo
        boatId,
        latitude: lat,
        longitude: lon,
        speed: spd,
        heading: hdg,
        
        // Analysis results
        distanceToBorder: parseFloat(distanceToBorder.toFixed(2)),
        riskLevel,
        predictedCrossingMinutes,
        suggestedDirection,
        advisory,
        prediction,
        
        // Metadata
        timestamp: new Date().toISOString(),
        processorVersion: '1.0.0',
        
        // Alert flag for downstream processing
        shouldAlert: riskLevel === 'WARNING' || riskLevel === 'DANGER'
    };
    
    return result;
}

// =====================================================
// AWS LAMBDA HANDLER (for direct Lambda deployment)
// =====================================================

/**
 * AWS Lambda handler wrapper
 * Uncomment this when deploying to AWS Lambda
 */
// exports.handler = async (event) => {
//     try {
//         const boatData = JSON.parse(event.body || '{}');
//         const result = processBoatData(boatData);
//         
//         return {
//             statusCode: 200,
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Access-Control-Allow-Origin': '*'
//             },
//             body: JSON.stringify(result)
//         };
//     } catch (error) {
//         return {
//             statusCode: 400,
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Access-Control-Allow-Origin': '*'
//             },
//             body: JSON.stringify({ error: error.message })
//         };
//     }
// };

// =====================================================
// MODULE EXPORT (for local server use)
// =====================================================

module.exports = processBoatData;

// Also export helper functions for testing
module.exports.calculateDistanceToBorder = calculateDistanceToBorder;
module.exports.calculateCrossingTime = calculateCrossingTime;
module.exports.determineRiskLevel = determineRiskLevel;
module.exports.SAFE_THRESHOLD = SAFE_THRESHOLD;
module.exports.WARNING_THRESHOLD = WARNING_THRESHOLD;
