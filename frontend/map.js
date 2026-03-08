// Marine Guardian AI - Map Module

// Palk Strait coordinates (between India and Sri Lanka)
const PALK_STRAIT_CENTER = [9.5, 79.5];
const DEFAULT_ZOOM = 9;

// Map instance
let map;
let borderLine;
let safeZoneCircle;
let boatMarkers = [];
let simulationInterval;
let isSimulating = false;
let isBorderVisible = false;
let isStormActive = false;
let isSOSActive = false;

// Storm zone variables
let stormZoneCircle = null;
let stormMarker = null;
let stormData = {
    position: null,
    radius: 15, // km
    waveHeight: 0,
    windSpeed: 0
};

// Satellite AIS Tracking System
const satellites = [
    { id: 'SAT-01', name: 'NAVSAT-1', active: true, coverage: 95 },
    { id: 'SAT-02', name: 'NAVSAT-2', active: true, coverage: 92 },
    { id: 'SAT-03', name: 'IRNSS-1', active: true, coverage: 88 },
    { id: 'SAT-04', name: 'IRNSS-2', active: true, coverage: 90 },
    { id: 'SAT-05', name: 'AIS-SAT-1', active: true, coverage: 94 },
    { id: 'SAT-06', name: 'AIS-SAT-2', active: true, coverage: 91 }
];

let lastSignalAlertTime = {}; // Track last signal alert per boat

// Risk thresholds in kilometers
const SAFE_THRESHOLD = 8;      // > 8 km = Safe
const WARNING_THRESHOLD = 3;   // 3-8 km = Warning
                               // < 3 km = Danger

// AI Prediction tracking
let lastPredictionTime = {}; // Track last prediction alert per boat to avoid spam

// Simulated fishing boats data
const boats = [
    {
        id: 'TN-FISH-001',
        position: [9.35, 79.30],
        status: 'safe',
        speed: 5.2,
        heading: 45,
        hasSafeZone: true,
        distanceToBorder: null,
        predictedCrossingTime: null,
        suggestedHeading: null,
        riskScore: 0,
        inStormZone: false,
        distanceToStorm: null,
        signalStrength: 95,
        lowSignal: false
    },
    {
        id: 'TN-FISH-002',
        position: [9.55, 79.45],
        status: 'safe',
        speed: 3.8,
        heading: 120,
        distanceToBorder: null,
        predictedCrossingTime: null,
        suggestedHeading: null,
        riskScore: 0,
        inStormZone: false,
        distanceToStorm: null,
        signalStrength: 88,
        lowSignal: false
    },
    {
        id: 'TN-FISH-003',
        position: [9.45, 79.65],
        status: 'warning',
        speed: 6.1,
        heading: 90,
        distanceToBorder: null,
        predictedCrossingTime: null,
        suggestedHeading: null,
        riskScore: 0,
        inStormZone: false,
        distanceToStorm: null,
        signalStrength: 72,
        lowSignal: false
    }
];

// International Maritime Border (India – Sri Lanka IMBL in Palk Strait)
const maritimeBorderPoints = [
    [9.32, 78.95],
    [9.24, 79.05],
    [9.15, 79.15],
    [9.05, 79.30],
    [8.95, 79.45],
    [8.88, 79.60],
    [8.82, 79.75],
    [8.75, 79.90],
    [8.70, 80.05],
    [8.65, 80.20]
];

// Unique colors for each boat
const boatColors = {
    'TN-FISH-001': '#00ff9d',  // Green
    'TN-FISH-002': '#ffb020',  // Orange
    'TN-FISH-003': '#00e1ff'   // Cyan
};

// ============================================
// Distance Calculation Functions
// ============================================

// Haversine formula to calculate distance between two points in km
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

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// Calculate minimum distance from a point to a line segment
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) {
        return haversineDistance(px, py, x1, y1);
    }
    
    // Project point onto line segment
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    
    return haversineDistance(px, py, projX, projY);
}

// Calculate minimum distance from boat to the entire border line
function calculateDistanceToBorder(boatPosition) {
    let minDistance = Infinity;
    
    for (let i = 0; i < maritimeBorderPoints.length - 1; i++) {
        const [lat1, lon1] = maritimeBorderPoints[i];
        const [lat2, lon2] = maritimeBorderPoints[i + 1];
        const distance = pointToSegmentDistance(
            boatPosition[0], boatPosition[1],
            lat1, lon1, lat2, lon2
        );
        minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
}

// Determine risk status based on distance
function getRiskStatus(distanceKm) {
    if (distanceKm < WARNING_THRESHOLD) {
        return 'danger';
    } else if (distanceKm < SAFE_THRESHOLD) {
        return 'warning';
    }
    return 'safe';
}

// Get marker color based on status
function getMarkerColor(status) {
    switch (status) {
        case 'danger': return '#ff3b3b';  // Red
        case 'warning': return '#ffb020'; // Orange
        default: return '#00ff9d';        // Green
    }
}

// ============================================
// AI Prediction Functions
// ============================================

// Calculate the angle from boat to nearest border point
function calculateAngleToBorder(boatPosition) {
    let minDistance = Infinity;
    let nearestPoint = null;
    
    for (let i = 0; i < maritimeBorderPoints.length - 1; i++) {
        const [lat1, lon1] = maritimeBorderPoints[i];
        const [lat2, lon2] = maritimeBorderPoints[i + 1];
        
        // Find closest point on this segment
        const dx = lat2 - lat1;
        const dy = lon2 - lon1;
        const lengthSquared = dx * dx + dy * dy;
        
        let t = 0;
        if (lengthSquared > 0) {
            t = ((boatPosition[0] - lat1) * dx + (boatPosition[1] - lon1) * dy) / lengthSquared;
            t = Math.max(0, Math.min(1, t));
        }
        
        const projLat = lat1 + t * dx;
        const projLon = lon1 + t * dy;
        const dist = haversineDistance(boatPosition[0], boatPosition[1], projLat, projLon);
        
        if (dist < minDistance) {
            minDistance = dist;
            nearestPoint = [projLat, projLon];
        }
    }
    
    if (!nearestPoint) return 90; // Default east
    
    // Calculate angle from boat to nearest border point
    const dLat = nearestPoint[0] - boatPosition[0];
    const dLon = nearestPoint[1] - boatPosition[1];
    const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
    return ((angle % 360) + 360) % 360;
}

// Calculate predicted crossing time based on speed, heading and distance
function calculatePredictedCrossingTime(boat) {
    if (!boat.distanceToBorder || boat.distanceToBorder >= SAFE_THRESHOLD) {
        return null;
    }
    
    // Calculate angle to border
    const angleToBorder = calculateAngleToBorder(boat.position);
    
    // Calculate how much the boat is heading towards the border
    // Angle difference between heading and direction to border
    let angleDiff = Math.abs(boat.heading - angleToBorder);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    
    // If boat is heading away from border (angle > 90), no crossing predicted
    if (angleDiff > 90) {
        return null;
    }
    
    // Calculate effective speed towards border (knots to km/h: 1 knot = 1.852 km/h)
    const speedKmH = boat.speed * 1.852;
    const approachFactor = Math.cos(toRadians(angleDiff));
    const effectiveSpeed = speedKmH * approachFactor;
    
    if (effectiveSpeed <= 0.1) return null;
    
    // Time in hours, convert to minutes
    const timeHours = boat.distanceToBorder / effectiveSpeed;
    const timeMinutes = Math.round(timeHours * 60);
    
    return timeMinutes;
}

// Calculate suggested safe heading (turn away from border)
function calculateSafeHeading(boat) {
    const angleToBorder = calculateAngleToBorder(boat.position);
    
    // Suggest heading opposite to border direction
    // Turn 30-60 degrees away from border
    let safeHeading = (angleToBorder + 180) % 360;
    
    // Calculate turn direction and amount
    let turnAmount = angleToBorder - boat.heading;
    if (turnAmount > 180) turnAmount -= 360;
    if (turnAmount < -180) turnAmount += 360;
    
    // Determine turn direction (West is negative/left in typical nav)
    let turnDirection;
    let turnDegrees = Math.abs(30 + Math.random() * 30); // 30-60 degrees
    
    if (turnAmount > 0) {
        turnDirection = 'West';
        safeHeading = (boat.heading - turnDegrees + 360) % 360;
    } else {
        turnDirection = 'East';
        safeHeading = (boat.heading + turnDegrees) % 360;
    }
    
    return {
        heading: Math.round(safeHeading),
        turnDegrees: Math.round(turnDegrees),
        direction: turnDirection
    };
}

// Calculate individual boat risk score (0-100)
function calculateBoatRiskScore(boat) {
    let score = 0;
    
    // Distance factor (closer = higher risk)
    if (boat.distanceToBorder !== null) {
        if (boat.distanceToBorder < WARNING_THRESHOLD) {
            score += 60 + (1 - boat.distanceToBorder / WARNING_THRESHOLD) * 40; // 60-100
        } else if (boat.distanceToBorder < SAFE_THRESHOLD) {
            score += 20 + ((SAFE_THRESHOLD - boat.distanceToBorder) / (SAFE_THRESHOLD - WARNING_THRESHOLD)) * 40; // 20-60
        } else {
            score += Math.max(0, 20 - (boat.distanceToBorder - SAFE_THRESHOLD) * 2); // 0-20
        }
    }
    
    // Speed factor (faster = higher risk when approaching)
    const angleToBorder = calculateAngleToBorder(boat.position);
    let angleDiff = Math.abs(boat.heading - angleToBorder);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    
    if (angleDiff < 90) {
        // Heading towards border
        score += (boat.speed / 10) * 10 * (1 - angleDiff / 90); // Up to 10 points
    }
    
    // Storm zone factor (adds significant risk)
    if (boat.inStormZone) {
        score += 25; // Add 25 points for being in storm zone
    } else if (boat.distanceToStorm !== null && boat.distanceToStorm < stormData.radius * 1.5) {
        // Near storm zone
        score += 10 * (1 - boat.distanceToStorm / (stormData.radius * 1.5));
    }
    
    return Math.min(100, Math.max(0, Math.round(score)));
}

// Run AI prediction for a boat
function runAIPrediction(boat) {
    // Calculate predicted crossing time
    boat.predictedCrossingTime = calculatePredictedCrossingTime(boat);
    
    // Calculate safe heading suggestion
    if (boat.status !== 'safe') {
        boat.suggestedHeading = calculateSafeHeading(boat);
    } else {
        boat.suggestedHeading = null;
    }
    
    // Calculate risk score
    boat.riskScore = calculateBoatRiskScore(boat);
    
    // Generate AI prediction alerts (throttled)
    const now = Date.now();
    const lastAlert = lastPredictionTime[boat.id] || 0;
    
    if (boat.predictedCrossingTime !== null && now - lastAlert > 10000) { // 10 second cooldown
        if (boat.predictedCrossingTime <= 30) { // Alert if crossing predicted within 30 minutes
            addAlert('ai', `🤖 AI Prediction: Boat ${boat.id} may cross the international border in ${boat.predictedCrossingTime} minutes if current direction continues.`);
            
            if (boat.suggestedHeading) {
                setTimeout(() => {
                    addAlert('ai', `🧭 Suggested Safe Direction: ${boat.id} turn ${boat.suggestedHeading.turnDegrees}° ${boat.suggestedHeading.direction} to remain in safe waters.`);
                }, 500);
            }
            
            lastPredictionTime[boat.id] = now;
        }
    }
}

// Calculate overall fleet safety metrics
function calculateFleetMetrics() {
    let totalRisk = 0;
    let boatsAtRisk = 0;
    let boatsInStorm = 0;
    
    boats.forEach(boat => {
        totalRisk += boat.riskScore;
        if (boat.status !== 'safe') boatsAtRisk++;
        if (boat.inStormZone) boatsInStorm++;
    });
    
    // Border Proximity Risk (average risk of all boats)
    const borderProximityRisk = Math.round(totalRisk / boats.length);
    
    // Fleet Safety Score (inverse of risk)
    const fleetSafetyScore = Math.max(0, 100 - borderProximityRisk);
    
    // Weather Hazard Index (based on storm status and boats in storm)
    let weatherHazardIndex = 15; // Base level
    if (isStormActive) {
        weatherHazardIndex = 50; // Storm active base
        // Add more if boats are in storm zone
        weatherHazardIndex += boatsInStorm * 15;
        // Cap at 95
        weatherHazardIndex = Math.min(95, weatherHazardIndex);
    }
    
    return {
        borderProximityRisk,
        fleetSafetyScore,
        weatherHazardIndex,
        boatsInStorm
    };
}

// Update AI Risk Analysis panel
function updateAIRiskAnalysis() {
    const metrics = calculateFleetMetrics();
    
    // Update border proximity risk
    const borderRiskEl = document.getElementById('border-proximity-risk');
    if (borderRiskEl) {
        borderRiskEl.textContent = `${metrics.borderProximityRisk}%`;
        borderRiskEl.className = metrics.borderProximityRisk > 60 ? 'risk-value danger' :
                                  metrics.borderProximityRisk > 30 ? 'risk-value warning' : 'risk-value safe';
    }
    
    // Update border proximity risk bar
    const proximityBar = document.querySelector('.risk-bar-fill.proximity');
    if (proximityBar) {
        proximityBar.style.width = `${metrics.borderProximityRisk}%`;
    }
    
    // Update fleet safety score
    const safetyScoreEl = document.getElementById('fleet-safety-score');
    if (safetyScoreEl) {
        safetyScoreEl.textContent = `${metrics.fleetSafetyScore}%`;
        safetyScoreEl.className = metrics.fleetSafetyScore < 40 ? 'risk-value danger' :
                                   metrics.fleetSafetyScore < 70 ? 'risk-value warning' : 'risk-value safe';
    }
    
    // Update fleet safety bar
    const safetyBar = document.querySelector('.risk-bar-fill.safety');
    if (safetyBar) {
        safetyBar.style.width = `${metrics.fleetSafetyScore}%`;
    }
    
    // Update weather hazard index  
    const weatherHazardEl = document.getElementById('weather-hazard-index');
    if (weatherHazardEl) {
        weatherHazardEl.textContent = `${metrics.weatherHazardIndex}%`;
        weatherHazardEl.className = metrics.weatherHazardIndex > 60 ? 'risk-value danger' :
                                     metrics.weatherHazardIndex > 30 ? 'risk-value warning' : 'risk-value safe';
    }
    
    // Update weather hazard bar
    const weatherBar = document.querySelector('.risk-bar-fill.weather');
    if (weatherBar) {
        weatherBar.style.width = `${metrics.weatherHazardIndex}%`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    initializeControls();
    updateTime();
    setInterval(updateTime, 1000);
});

function initializeMap() {
    // Create map centered on Palk Strait
    map = L.map('map-container', {
        center: PALK_STRAIT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false
    });

    // Add dark-themed map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Add boat markers
    boats.forEach(boat => {
        addBoatMarker(boat);
    });

    // Add labels for India and Sri Lanka
    addRegionLabels();
    
    // Initialize fleet stats and vessel list
    updateVesselList();
    updateFleetStats();
    
    // Initialize AI predictions for all boats
    boats.forEach(boat => runAIPrediction(boat));
    updateAIRiskAnalysis();

    addAlert('info', 'Map initialized - Palk Strait region loaded');
    addAlert('ai', '🤖 AI Risk Analysis module activated');
}

function addBoatMarker(boat) {
    // Calculate initial distance to border
    boat.distanceToBorder = calculateDistanceToBorder(boat.position);
    boat.status = getRiskStatus(boat.distanceToBorder);
    
    // Create custom boat icon with color based on status
    const marker = L.marker(boat.position, { icon: createBoatIcon(boat) })
        .addTo(map)
        .bindPopup(createBoatPopup(boat));

    marker.boatData = boat;
    boatMarkers.push(marker);

    // Add safe zone circle for designated boat
    if (boat.hasSafeZone) {
        safeZoneCircle = L.circle(boat.position, {
            color: '#00ff9d',
            fillColor: '#00ff9d',
            fillOpacity: 0.15,
            radius: 8000,
            dashArray: '10, 5',
            weight: 2
        }).addTo(map);
    }
}

function createBoatIcon(boat) {
    // Use unique boat color, fallback to status-based color
    const uniqueColor = boatColors[boat.id];
    const statusColor = getMarkerColor(boat.status);
    const color = uniqueColor || statusColor;
    
    // Glow based on risk status
    const glowColor = boat.status === 'danger' ? 'rgba(255, 59, 59, 0.6)' :
                      boat.status === 'warning' ? 'rgba(255, 176, 32, 0.6)' :
                      'rgba(0, 255, 157, 0.4)';
    
    return L.divIcon({
        className: 'boat-marker',
        html: `<div class="boat-icon-wrapper" style="
            transform: rotate(${boat.heading}deg);
            filter: drop-shadow(0 0 6px ${glowColor});
        ">
            <svg width="30" height="30" viewBox="0 0 30 30">
                <polygon points="15,2 25,25 15,20 5,25" fill="${color}" stroke="#fff" stroke-width="1"/>
            </svg>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

function createBoatPopup(boat) {
    const statusColor = boat.status === 'safe' ? '#00ff9d' : 
                       boat.status === 'warning' ? '#ffb020' : '#ff3b3b';
    const statusLabel = boat.status === 'safe' ? 'SAFE' : 
                       boat.status === 'warning' ? 'WARNING' : 'DANGER';
    const distanceText = boat.distanceToBorder !== null ? 
                        `${boat.distanceToBorder.toFixed(1)} km` : 'Calculating...';
    
    // AI Prediction info
    const crossingTimeText = boat.predictedCrossingTime !== null ? 
                            `${boat.predictedCrossingTime} min` : 'N/A';
    const riskLevelText = boat.riskScore >= 60 ? 'HIGH' : 
                         boat.riskScore >= 30 ? 'MEDIUM' : 'LOW';
    const riskColor = boat.riskScore >= 60 ? '#ff3b3b' : 
                     boat.riskScore >= 30 ? '#ffb020' : '#00ff9d';
    
    // Signal strength info
    const signalStrength = boat.signalStrength || 0;
    const signalLabel = signalStrength >= 70 ? 'Strong' : 
                       signalStrength >= 40 ? 'Moderate' : 'Weak';
    const signalColor = signalStrength >= 70 ? '#00ff9d' : 
                       signalStrength >= 40 ? '#ffb020' : '#ff3b3b';
    
    let suggestionHTML = '';
    if (boat.suggestedHeading && boat.status !== 'safe') {
        suggestionHTML = `
            <div style="margin-top: 8px; padding: 6px; background: #e0f2fe; border-radius: 4px; border-left: 3px solid #0ea5e9;">
                <div style="font-size: 11px; color: #0369a1; font-weight: 600;">🧭 AI SUGGESTION</div>
                <div style="font-size: 11px; color: #0c4a6e;">Turn ${boat.suggestedHeading.turnDegrees}° ${boat.suggestedHeading.direction}</div>
            </div>
        `;
    }
    
    // Storm warning HTML
    let stormWarningHTML = '';
    if (boat.inStormZone) {
        stormWarningHTML = `
            <div style="margin-top: 8px; padding: 6px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #ffb020;">
                <div style="font-size: 11px; color: #92400e; font-weight: 600;">⛈️ STORM WARNING</div>
                <div style="font-size: 11px; color: #78350f;">Wave Height: ${stormData.waveHeight}m | Wind: ${stormData.windSpeed} knots</div>
            </div>
        `;
    } else if (boat.distanceToStorm !== null && boat.distanceToStorm < stormData.radius * 1.5) {
        stormWarningHTML = `
            <div style="margin-top: 8px; padding: 6px; background: #fef9c3; border-radius: 4px; border-left: 3px solid #eab308;">
                <div style="font-size: 11px; color: #713f12; font-weight: 600;">⚠️ STORM NEARBY</div>
                <div style="font-size: 11px; color: #78350f;">Distance to storm: ${boat.distanceToStorm.toFixed(1)} km</div>
            </div>
        `;
    }
    
    return `
        <div style="color: #1a2332; min-width: 220px;">
            <h3 style="margin: 0 0 8px 0; color: #0a0e17; display: flex; align-items: center; gap: 8px;">
                ${boat.id}
                <span style="font-size: 10px; padding: 2px 6px; border-radius: 3px; background: ${statusColor}; color: white;">${statusLabel}</span>
                ${boat.inStormZone ? '<span style="font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #4f46e5; color: white;">⛈️ STORM</span>' : ''}
            </h3>
            
            <div style="font-size: 12px; color: #666; line-height: 1.8;">
                <div style="display: flex; justify-content: space-between;">
                    <span><strong>Speed:</strong></span>
                    <span>${boat.speed} knots</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span><strong>Distance to Border:</strong></span>
                    <span style="color: ${statusColor}; font-weight: 600;">${distanceText}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span><strong>Predicted Crossing:</strong></span>
                    <span style="color: ${boat.predictedCrossingTime ? '#ff3b3b' : '#666'};">${crossingTimeText}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span><strong>Risk Level:</strong></span>
                    <span style="color: ${riskColor}; font-weight: 600;">${riskLevelText} (${boat.riskScore}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #ddd;">
                    <span><strong>📡 Signal Strength:</strong></span>
                    <span style="color: ${signalColor}; font-weight: 600;">${signalStrength}% (${signalLabel})</span>
                </div>
                <div style="margin-top: 4px; background: #e5e7eb; height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${signalStrength}%; background: ${signalColor}; border-radius: 3px;"></div>
                </div>
            </div>
            ${stormWarningHTML}
            ${suggestionHTML}
        </div>
    `;
}

function addRegionLabels() {
    // India label
    L.marker([9.8, 79.0], {
        icon: L.divIcon({
            className: 'region-label',
            html: '<div style="color: #06b6d4; font-size: 14px; font-weight: bold; text-shadow: 0 0 10px rgba(0,0,0,0.8);">INDIA</div>',
            iconSize: [60, 20]
        })
    }).addTo(map);

    // Sri Lanka label
    L.marker([9.2, 80.0], {
        icon: L.divIcon({
            className: 'region-label',
            html: '<div style="color: #06b6d4; font-size: 14px; font-weight: bold; text-shadow: 0 0 10px rgba(0,0,0,0.8);">SRI LANKA</div>',
            iconSize: [80, 20]
        })
    }).addTo(map);
}

function initializeControls() {
    // Map zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut());
    document.getElementById('center-map').addEventListener('click', () => {
        map.setView(PALK_STRAIT_CENTER, DEFAULT_ZOOM);
    });

    // Main control buttons
    document.getElementById('start-simulation').addEventListener('click', toggleSimulation);
    document.getElementById('show-border').addEventListener('click', toggleBorder);
    document.getElementById('storm-alert').addEventListener('click', toggleStormAlert);
    document.getElementById('sos-emergency').addEventListener('click', toggleSOSEmergency);
}

function toggleSimulation() {
    const btn = document.getElementById('start-simulation');
    
    if (isSimulating) {
        clearInterval(simulationInterval);
        isSimulating = false;
        btn.innerHTML = '<span class="btn-icon">▶</span>Start Simulation';
        btn.classList.remove('active');
        addAlert('info', 'Simulation stopped');
    } else {
        isSimulating = true;
        btn.innerHTML = '<span class="btn-icon">⏹</span>Stop Simulation';
        btn.classList.add('active');
        addAlert('success', 'Simulation started - boats moving every 2 seconds');
        
        // Move boats every 2 seconds
        simulationInterval = setInterval(updateBoatPositions, 2000);
    }
}

function updateBoatPositions() {
    boatMarkers.forEach((marker, index) => {
        const boat = marker.boatData;
        
        // Simulate realistic movement based on heading and speed
        // Convert heading to radians and calculate movement
        const headingRad = toRadians(boat.heading);
        const speedFactor = boat.speed * 0.0001; // Scale speed for visual effect
        
        // Add some randomness to simulate realistic boat movement
        const randomFactor = (Math.random() - 0.5) * 0.002;
        const latChange = Math.cos(headingRad) * speedFactor + randomFactor;
        const lngChange = Math.sin(headingRad) * speedFactor + randomFactor;
        
        // Update position
        boat.position[0] += latChange;
        boat.position[1] += lngChange;
        
        // Occasionally change heading slightly for realistic movement
        if (Math.random() < 0.3) {
            boat.heading += (Math.random() - 0.5) * 20;
            boat.heading = ((boat.heading % 360) + 360) % 360; // Normalize to 0-360
        }
        
        // Calculate distance to border
        const oldDistance = boat.distanceToBorder;
        boat.distanceToBorder = calculateDistanceToBorder(boat.position);
        
        // Update marker position and icon
        marker.setLatLng(boat.position);
        marker.setIcon(createBoatIcon(boat));
        marker.setPopupContent(createBoatPopup(boat));
        
        // Update safe zone circle if applicable
        if (boat.hasSafeZone && safeZoneCircle) {
            safeZoneCircle.setLatLng(boat.position);
        }
        
        // Check storm zone proximity
        if (isStormActive && stormData.position) {
            checkBoatsInStormZone();
        }
        
        // Update satellite signal strength
        updateSignalStrength(boat);
        
        // Run AI prediction
        runAIPrediction(boat);
        
        // Check and update border proximity status
        checkBorderProximity(boat, marker);
    });
    
    // Always update fleet stats and AI analysis after movement
    updateFleetStats();
    updateAIRiskAnalysis();
    updateSatelliteStatus();
}

// Update signal strength for a boat - simulates satellite AIS signal fluctuation
function updateSignalStrength(boat) {
    const LOW_SIGNAL_THRESHOLD = 40;
    
    // Base signal fluctuation
    let fluctuation = (Math.random() - 0.5) * 10;
    
    // Storm affects signal negatively
    if (boat.inStormZone) {
        fluctuation -= Math.random() * 15;
    } else if (boat.distanceToStorm !== null && boat.distanceToStorm < stormData.radius * 1.5) {
        fluctuation -= Math.random() * 8;
    }
    
    // Update signal strength
    boat.signalStrength = Math.max(15, Math.min(100, boat.signalStrength + fluctuation));
    
    // Check for low signal alert
    const now = Date.now();
    if (boat.signalStrength < LOW_SIGNAL_THRESHOLD) {
        if (!boat.lowSignal) {
            boat.lowSignal = true;
            // Only alert once every 30 seconds per boat
            if (!lastSignalAlertTime[boat.id] || now - lastSignalAlertTime[boat.id] > 30000) {
                lastSignalAlertTime[boat.id] = now;
                addAlert('warning', `📡 Low satellite signal detected for vessel ${boat.id} - Signal strength: ${Math.round(boat.signalStrength)}%`);
            }
        }
    } else {
        if (boat.lowSignal) {
            boat.lowSignal = false;
            addAlert('info', `📡 Signal restored for vessel ${boat.id} - Signal strength: ${Math.round(boat.signalStrength)}%`);
        }
    }
}

// Update satellite status in header
function updateSatelliteStatus() {
    const activeSatellites = satellites.filter(s => s.active).length;
    const totalSatellites = satellites.length;
    const satElement = document.getElementById('satellite-count');
    if (satElement) {
        satElement.textContent = `Satellites: ${activeSatellites}/${totalSatellites} active`;
        
        // Update satellite icon color based on coverage
        const avgCoverage = satellites.reduce((sum, s) => sum + s.coverage, 0) / satellites.length;
        const satIcon = document.querySelector('.satellite-icon');
        if (satIcon) {
            if (avgCoverage >= 90) {
                satIcon.style.color = '#00ff9d';
            } else if (avgCoverage >= 80) {
                satIcon.style.color = '#ffb020';
            } else {
                satIcon.style.color = '#ff3b3b';
            }
        }
    }
}

function checkBorderProximity(boat, marker) {
    // Get new status based on actual distance calculation
    const newStatus = getRiskStatus(boat.distanceToBorder);
    const distanceKm = boat.distanceToBorder.toFixed(1);
    
    if (newStatus !== boat.status) {
        const oldStatus = boat.status;
        boat.status = newStatus;
        
        // Update marker icon with new color
        marker.setIcon(createBoatIcon(boat));
        
        // Update vessel list in left panel
        updateVesselList();
        
        // Generate appropriate alert message
        if (newStatus === 'danger') {
            addAlert('danger', `🚨 DANGER: Boat ${boat.id} very close to international border (${distanceKm} km remaining)`);
        } else if (newStatus === 'warning') {
            if (oldStatus === 'safe') {
                addAlert('warning', `⚠️ WARNING: Boat ${boat.id} approaching border (${distanceKm} km remaining)`);
            } else if (oldStatus === 'danger') {
                addAlert('info', `📍 ${boat.id} moved back to warning zone (${distanceKm} km from border)`);
            }
        } else if (newStatus === 'safe') {
            addAlert('success', `✅ ${boat.id} returned to safe zone (${distanceKm} km from border)`);
        }
    }
}

function toggleBorder() {
    const btn = document.getElementById('show-border');
    
    if (isBorderVisible) {
        if (borderLine) {
            map.removeLayer(borderLine);
        }
        isBorderVisible = false;
        btn.classList.remove('active');
        addAlert('info', 'Maritime border hidden');
    } else {
        borderLine = L.polyline(maritimeBorderPoints, {
            color: '#ff3b3b',
            weight: 4,
            dashArray: '10, 12',
            opacity: 0.9,
            smoothFactor: 2
        }).addTo(map);
        
        // Ensure border is below boat markers
        borderLine.bringToBack();
        
        // Add label to the border line
        borderLine.bindTooltip('India – Sri Lanka Maritime Boundary', {
            sticky: true
        });
        
        isBorderVisible = true;
        btn.classList.add('active');
        addAlert('warning', 'Maritime border displayed - Red dashed line');
    }
}

function toggleStormAlert() {
    const btn = document.getElementById('storm-alert');
    
    if (isStormActive) {
        // Deactivate storm
        isStormActive = false;
        btn.classList.remove('active');
        
        // Remove storm zone from map
        removeStormZone();
        
        // Reset boat storm status
        boats.forEach(boat => {
            boat.inStormZone = false;
            boat.distanceToStorm = null;
        });
        
        // Update UI
        document.getElementById('wind-speed').textContent = '12 knots';
        document.getElementById('wave-height').textContent = '1.2m';
        document.getElementById('visibility').textContent = 'Good';
        addAlert('success', 'Storm alert cancelled - Conditions returning to normal');
        updateAIRiskAnalysis();
        updateVesselList();
    } else {
        // Activate storm
        isStormActive = true;
        btn.classList.add('active');
        
        // Generate storm properties
        generateStormZone();
        
        // Create storm visualization on map
        createStormZone();
        
        // Check which boats are in storm zone
        checkBoatsInStormZone();
        
        // Update UI
        document.getElementById('wind-speed').textContent = `${stormData.windSpeed} knots`;
        document.getElementById('wave-height').textContent = `${stormData.waveHeight}m`;
        document.getElementById('visibility').textContent = 'Poor';
        
        addAlert('danger', `⛈️ STORM ALERT: Severe weather detected! Radius: ${stormData.radius} km`);
        addAlert('warning', `🌊 Wave Height: ${stormData.waveHeight}m | Wind Speed: ${stormData.windSpeed} knots`);
        
        updateAIRiskAnalysis();
        updateVesselList();
    }
}

// Generate storm zone properties
function generateStormZone() {
    // Pick a random boat to place storm near
    const targetBoat = boats[Math.floor(Math.random() * boats.length)];
    
    // Offset storm position randomly near the boat (within 20km)
    const latOffset = (Math.random() - 0.5) * 0.2;
    const lngOffset = (Math.random() - 0.5) * 0.2;
    
    stormData.position = [
        targetBoat.position[0] + latOffset,
        targetBoat.position[1] + lngOffset
    ];
    
    // Generate random storm intensity
    stormData.waveHeight = (2 + Math.random() * 3).toFixed(1); // 2-5 meters
    stormData.windSpeed = Math.round(35 + Math.random() * 25); // 35-60 knots
    stormData.radius = 15; // 15 km radius
}

// Create storm zone visualization on map
function createStormZone() {
    if (!stormData.position) return;
    
    // Create storm circle
    stormZoneCircle = L.circle(stormData.position, {
        color: '#6366f1',
        fillColor: '#4f46e5',
        fillOpacity: 0.25,
        radius: stormData.radius * 1000, // Convert km to meters
        dashArray: '8, 8',
        weight: 3
    }).addTo(map);
    
    // Create animated storm rings
    const innerRing = L.circle(stormData.position, {
        color: '#818cf8',
        fillColor: 'transparent',
        fillOpacity: 0,
        radius: stormData.radius * 500,
        dashArray: '4, 4',
        weight: 2,
        className: 'storm-ring-inner'
    }).addTo(map);
    
    // Create storm icon marker
    stormMarker = L.marker(stormData.position, {
        icon: L.divIcon({
            className: 'storm-marker',
            html: `
                <div class="storm-icon-container">
                    <div class="storm-icon">⛈️</div>
                    <div class="storm-label">STORM</div>
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        })
    }).addTo(map);
    
    // Bind popup with storm info
    stormMarker.bindPopup(`
        <div style="color: #1a2332; min-width: 180px;">
            <h3 style="margin: 0 0 8px 0; color: #4f46e5;">⛈️ Storm Zone</h3>
            <div style="font-size: 12px; color: #666; line-height: 1.8;">
                <div><strong>Radius:</strong> ${stormData.radius} km</div>
                <div><strong>Wave Height:</strong> ${stormData.waveHeight} m</div>
                <div><strong>Wind Speed:</strong> ${stormData.windSpeed} knots</div>
                <div><strong>Visibility:</strong> Poor</div>
                <div style="margin-top: 8px; padding: 4px 8px; background: #fee2e2; border-radius: 4px; color: #dc2626; font-weight: 600; text-align: center;">
                    ⚠️ HAZARDOUS CONDITIONS
                </div>
            </div>
        </div>
    `);
}

// Remove storm zone from map
function removeStormZone() {
    if (stormZoneCircle) {
        map.removeLayer(stormZoneCircle);
        stormZoneCircle = null;
    }
    if (stormMarker) {
        map.removeLayer(stormMarker);
        stormMarker = null;
    }
    // Remove any additional storm layers
    map.eachLayer(layer => {
        if (layer.options && layer.options.className === 'storm-ring-inner') {
            map.removeLayer(layer);
        }
    });
    stormData.position = null;
}

// Check which boats are in the storm zone
function checkBoatsInStormZone() {
    if (!isStormActive || !stormData.position) return;
    
    boats.forEach(boat => {
        // Calculate distance from boat to storm center
        const distance = haversineDistance(
            boat.position[0], boat.position[1],
            stormData.position[0], stormData.position[1]
        );
        
        boat.distanceToStorm = distance;
        const wasInStorm = boat.inStormZone;
        boat.inStormZone = distance <= stormData.radius;
        
        // Generate weather advisory if boat just entered storm zone
        if (boat.inStormZone && !wasInStorm) {
            addAlert('danger', `🌊 Weather Advisory: Storm detected near vessel ${boat.id}`);
            addAlert('warning', `   Wave height: ${stormData.waveHeight} meters | Wind speed: ${stormData.windSpeed} knots`);
        } else if (!boat.inStormZone && wasInStorm) {
            addAlert('success', `✅ ${boat.id} has exited the storm zone`);
        }
        
        // Recalculate risk score
        boat.riskScore = calculateBoatRiskScore(boat);
    });
}

function toggleSOSEmergency() {
    const btn = document.getElementById('sos-emergency');
    
    if (isSOSActive) {
        isSOSActive = false;
        btn.classList.remove('active');
        addAlert('info', 'SOS Emergency cancelled');
    } else {
        isSOSActive = true;
        btn.classList.add('active');
        addAlert('danger', '🆘 SOS EMERGENCY BROADCAST: Coast Guard notified! Emergency response initiated!');
        
        // Auto-deactivate after 5 seconds
        setTimeout(() => {
            if (isSOSActive) {
                isSOSActive = false;
                btn.classList.remove('active');
                addAlert('info', 'SOS broadcast completed - Awaiting response');
            }
        }, 5000);
    }
}

function addAlert(type, message) {
    const alertFeed = document.getElementById('alert-feed');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    const alertHTML = `
        <div class="alert-item ${type}">
            <span class="alert-time">${time}</span>
            <span class="alert-message">${message}</span>
        </div>
    `;
    
    alertFeed.insertAdjacentHTML('afterbegin', alertHTML);
    
    // Keep only last 20 alerts
    const alerts = alertFeed.querySelectorAll('.alert-item');
    if (alerts.length > 20) {
        alerts[alerts.length - 1].remove();
    }
}

function updateVesselList() {
    const vesselList = document.getElementById('vessel-list');
    vesselList.innerHTML = '';
    
    boats.forEach(boat => {
        const distanceText = boat.distanceToBorder !== null ? 
                            `${boat.distanceToBorder.toFixed(1)} km` : '...';
        let statusText;
        let statusClass = boat.status;
        
        // Check for storm warning first
        if (boat.inStormZone) {
            statusText = `⛈️ IN STORM ZONE`;
            statusClass = 'storm';
        } else if (boat.status === 'safe') {
            statusText = `Safe Zone (${distanceText})`;
        } else if (boat.status === 'warning') {
            statusText = `⚠️ Near Border (${distanceText})`;
        } else {
            statusText = `🚨 DANGER (${distanceText})`;
        }
        
        // Add storm proximity warning
        let stormWarning = '';
        if (boat.inStormZone) {
            stormWarning = `<span class="storm-warning-badge">🌊 ${stormData.waveHeight}m waves</span>`;
        }
        
        // Signal strength bar and indicator
        const signalStrength = boat.signalStrength || 0;
        const signalClass = signalStrength >= 70 ? 'signal-strong' : 
                           signalStrength >= 40 ? 'signal-moderate' : 'signal-weak';
        const signalLabel = signalStrength >= 70 ? 'Strong' : 
                           signalStrength >= 40 ? 'Mod' : 'Weak';
        let lowSignalWarning = '';
        if (signalStrength < 40) {
            lowSignalWarning = `<span class="low-signal-badge">📡 Low Signal</span>`;
        }
        
        vesselList.innerHTML += `
            <li class="vessel-item ${statusClass}">
                <span class="vessel-icon">🚤</span>
                <div class="vessel-info">
                    <span class="vessel-name">${boat.id}</span>
                    <span class="vessel-status">${statusText}</span>
                    ${stormWarning}
                    ${lowSignalWarning}
                </div>
                <div class="signal-indicator ${signalClass}">
                    <div class="signal-bars">
                        <span class="bar bar-1"></span>
                        <span class="bar bar-2"></span>
                        <span class="bar bar-3"></span>
                        <span class="bar bar-4"></span>
                    </div>
                    <span class="signal-text">${signalStrength}%</span>
                </div>
            </li>
        `;
    });
}

function updateFleetStats() {
    let safe = 0, warning = 0, danger = 0;
    
    boats.forEach(boat => {
        if (boat.status === 'safe') safe++;
        else if (boat.status === 'warning') warning++;
        else if (boat.status === 'danger') danger++;
    });
    
    document.getElementById('safe-count').textContent = safe;
    document.getElementById('warning-count').textContent = warning;
    document.getElementById('danger-count').textContent = danger;
}

function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const dateString = now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    document.getElementById('current-time').textContent = `${dateString} ${timeString}`;
}
