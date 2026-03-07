const vesselData = [
  { id: 'TN-FISH-002', speed: 19, heading: 72, distanceToBorder: 12.5, weatherFactor: 1.1 },
  { id: 'TN-FISH-014', speed: 24, heading: 25, distanceToBorder: 6.2, weatherFactor: 1.35 },
  { id: 'TN-FISH-031', speed: 12, heading: 148, distanceToBorder: 22.1, weatherFactor: 0.9 }
];

const vesselMapAnchors = [
  [9.3, 79.15],
  [9.55, 79.35],
  [9.78, 79.72]
];

const vesselMarkers = [];
let telemetryTimerId = null;
let stormSeries = [28, 35, 47, 63, 55, 41];
const stormLabels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];

function incidentMessageForRisk(vesselId, riskLabel, heading, distance) {
  if (riskLabel === 'HIGH') {
    return `${vesselId} approaching geofence at ${distance.toFixed(1)} nm. Immediate heading correction advised (${heading}°).`;
  }
  if (riskLabel === 'MEDIUM') {
    return `${vesselId} entering caution zone. Monitor heading ${heading}° and prepare westward adjustment.`;
  }
  return `${vesselId} operating in safe corridor. Border buffer stable at ${distance.toFixed(1)} nm.`;
}

function updateIncidentTicker(vessel, risk) {
  const ticker = document.getElementById('incidentTicker');
  const severity = document.getElementById('incidentSeverity');

  if (!ticker || !severity || !vessel) return;

  ticker.textContent = incidentMessageForRisk(vessel.id, risk.label, vessel.heading, vessel.distanceToBorder);
  severity.textContent = risk.label;
  severity.classList.remove('incident-low', 'incident-medium', 'incident-high');

  if (risk.label === 'HIGH') {
    severity.classList.add('incident-high');
    return;
  }

  if (risk.label === 'MEDIUM') {
    severity.classList.add('incident-medium');
    return;
  }

  severity.classList.add('incident-low');
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function calculateRiskScore(speed, angleToBorder, distanceToBorder, weatherFactor) {
  const safeDistance = Math.max(distanceToBorder, 0.5);
  return (speed * Math.cos(toRadians(angleToBorder)) / safeDistance) + weatherFactor;
}

function classifyRisk(score) {
  if (score >= 3.2) return { label: 'HIGH', className: 'risk-red' };
  if (score >= 1.8) return { label: 'MEDIUM', className: 'risk-yellow' };
  return { label: 'LOW', className: 'risk-green' };
}

function advisoryFromHeading(heading) {
  if (heading < 45) return 'Warning: Turn 30° West to avoid border crossing.';
  if (heading < 90) return 'Caution: Shift heading 15° South-West to stay compliant.';
  return 'Trajectory stable. Maintain current lane and monitor weather changes.';
}

function updateTelemetrySnapshot() {
  vesselData.forEach((vessel) => {
    const speedDelta = (Math.random() - 0.5) * 3.2;
    const headingDelta = Math.round((Math.random() - 0.5) * 18);
    const distanceDelta = (Math.random() - 0.5) * 0.9;
    const weatherDelta = (Math.random() - 0.5) * 0.16;

    vessel.speed = Math.max(6, Math.min(32, Number((vessel.speed + speedDelta).toFixed(1))));
    vessel.heading = (vessel.heading + headingDelta + 360) % 360;
    vessel.distanceToBorder = Math.max(1.2, Math.min(30, Number((vessel.distanceToBorder + distanceDelta).toFixed(1))));
    vessel.weatherFactor = Math.max(0.7, Math.min(1.8, Number((vessel.weatherFactor + weatherDelta).toFixed(2))));
  });
}

function refreshMapMarkers() {
  vesselMarkers.forEach((entry) => {
    const score = calculateRiskScore(
      entry.vessel.speed,
      entry.vessel.heading,
      entry.vessel.distanceToBorder,
      entry.vessel.weatherFactor
    );
    const risk = classifyRisk(score);
    const color = risk.label === 'HIGH' ? '#ef4444' : risk.label === 'MEDIUM' ? '#eab308' : '#22c55e';

    entry.marker.setStyle({
      color,
      fillColor: color
    });

    entry.marker.setPopupContent(`${entry.vessel.id}<br/>Speed: ${entry.vessel.speed} kn<br/>Risk: ${risk.label}`);
  });
}

function renderVessels() {
  const vesselList = document.getElementById('vesselList');
  const advisoryText = document.getElementById('advisoryText');
  if (!vesselList || !advisoryText) {
    return;
  }
  let highestRisk = -Infinity;
  let priorityMessage = advisoryText.textContent;
  let highestRiskVessel = null;
  let highestRiskLabel = { label: 'LOW', className: 'risk-green' };

  vesselList.innerHTML = vesselData
    .map((vessel) => {
      const riskScore = calculateRiskScore(
        vessel.speed,
        vessel.heading,
        vessel.distanceToBorder,
        vessel.weatherFactor
      );

      if (riskScore > highestRisk) {
        highestRisk = riskScore;
        priorityMessage = `${vessel.id}: ${advisoryFromHeading(vessel.heading)}`;
        highestRiskVessel = vessel;
      }

      const risk = classifyRisk(riskScore);

      if (highestRiskVessel === vessel) {
        highestRiskLabel = risk;
      }

      return `
        <article class="vessel-card">
          <div class="flex items-center justify-between gap-2">
            <p class="font-semibold" style="color:#3d2e14">${vessel.id}</p>
            <span class="risk-pill ${risk.className}">${risk.label}</span>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-y-1 text-xs" style="color:#6b5a42">
            <span>Speed</span><span class="text-right">${vessel.speed} kn</span>
            <span>Heading</span><span class="text-right">${vessel.heading}°</span>
            <span>Distance</span><span class="text-right">${vessel.distanceToBorder.toFixed(1)} nm</span>
            <span>Risk Score</span><span class="text-right">${riskScore.toFixed(2)}</span>
          </div>
        </article>
      `;
    })
    .join('');

  const advisory = document.getElementById('advisory');
  advisoryText.textContent = priorityMessage;

  if (highestRisk >= 3.2) {
    advisory.classList.add('alert-flash');
  } else {
    advisory.classList.remove('alert-flash');
  }

  updateIncidentTicker(highestRiskVessel, highestRiskLabel);

  const fleetAverage = vesselData.reduce((sum, vessel) => {
    return sum + calculateRiskScore(vessel.speed, vessel.heading, vessel.distanceToBorder, vessel.weatherFactor);
  }, 0) / vesselData.length;

  const normalizedScore = Math.max(45, Math.min(95, Math.round(100 - fleetAverage * 9.5)));
  updateFleetScore(normalizedScore);
}

function updateFleetScore(value) {
  const label = document.getElementById('fleetScore');
  const circle = document.getElementById('fleetCircle');
  const circumference = 326.73;
  const offset = circumference - (value / 100) * circumference;

  label.textContent = value;
  circle.style.strokeDashoffset = offset.toFixed(2);
}

function initMap() {
  const mapElement = document.getElementById('map');
  if (typeof L === 'undefined' || !mapElement) {
    return;
  }

  const map = L.map(mapElement, {
    zoomControl: false,
    attributionControl: false
  }).setView([9.6, 79.6], 8);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  const borderLine = L.polyline(
    [
      [9.1, 79.0],
      [9.8, 79.35],
      [10.35, 79.95]
    ],
    { color: '#d9ad5d', weight: 3, dashArray: '8 8', opacity: 0.85 }
  ).addTo(map);

  borderLine.bindTooltip('International Geofence', { permanent: false });

  vesselData.forEach((vessel, index) => {
    const coords = vesselMapAnchors[index];

    const score = calculateRiskScore(vessel.speed, vessel.heading, vessel.distanceToBorder, vessel.weatherFactor);
    const risk = classifyRisk(score);

    const color = risk.label === 'HIGH' ? '#ef4444' : risk.label === 'MEDIUM' ? '#eab308' : '#22c55e';

    const marker = L.circleMarker(coords, {
      radius: 7,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2
    })
      .addTo(map)
      .bindPopup(`${vessel.id}<br/>Speed: ${vessel.speed} kn<br/>Risk: ${risk.label}`);

    vesselMarkers.push({ vessel, marker });
  });
}

function renderStormChart() {
  const ctx = document.getElementById('stormChart');

  if (!ctx) {
    return;
  }
  drawStormCanvas(ctx, stormSeries, stormLabels);
}

function updateStormHazard() {
  stormSeries = stormSeries.map((point) => {
    const next = point + (Math.random() - 0.5) * 10;
    return Math.max(10, Math.min(95, Number(next.toFixed(1))));
  });

  const canvas = document.getElementById('stormChart');
  if (canvas) {
    drawStormCanvas(canvas, stormSeries, stormLabels);
  }
}

function drawStormCanvas(canvas, values, labels) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = 220;

  canvas.style.width = '100%';
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 18, right: 16, bottom: 34, left: 36 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;

  context.strokeStyle = 'rgba(180, 150, 90, 0.25)';
  context.lineWidth = 1;

  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (plotHeight / 4) * index;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(padding.left + plotWidth, y);
    context.stroke();
  }

  context.fillStyle = '#8a7a5a';
  context.font = '11px Inter, sans-serif';
  context.textAlign = 'center';

  values.forEach((_, index) => {
    const x = padding.left + (plotWidth / (values.length - 1)) * index;
    context.fillText(labels[index], x, cssHeight - 10);
  });

  const points = values.map((value, index) => {
    const x = padding.left + (plotWidth / (values.length - 1)) * index;
    const y = padding.top + ((100 - value) / 100) * plotHeight;
    return { x, y };
  });

  const areaGradient = context.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
  areaGradient.addColorStop(0, 'rgba(217, 173, 93, 0.3)');
  areaGradient.addColorStop(1, 'rgba(217, 173, 93, 0.02)');

  context.beginPath();
  context.moveTo(points[0].x, padding.top + plotHeight);
  points.forEach((point) => {
    context.lineTo(point.x, point.y);
  });
  context.lineTo(points[points.length - 1].x, padding.top + plotHeight);
  context.closePath();
  context.fillStyle = areaGradient;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
      return;
    }
    context.lineTo(point.x, point.y);
  });
  context.strokeStyle = '#d9ad5d';
  context.lineWidth = 2;
  context.stroke();

  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fillStyle = '#c8973a';
    context.fill();
  });
}

function runTelemetryTick() {
  updateTelemetrySnapshot();
  renderVessels();
  refreshMapMarkers();
  updateStormHazard();
}

function startTelemetryLoop() {
  if (telemetryTimerId !== null) {
    return;
  }

  const tick = () => {
    runTelemetryTick();
    telemetryTimerId = window.setTimeout(tick, 4500);
  };

  telemetryTimerId = window.setTimeout(tick, 4500);
}

function stopTelemetryLoop() {
  if (telemetryTimerId === null) {
    return;
  }

  window.clearTimeout(telemetryTimerId);
  telemetryTimerId = null;
}

initMap();
renderVessels();
renderStormChart();
startTelemetryLoop();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTelemetryLoop();
    return;
  }

  startTelemetryLoop();
});
