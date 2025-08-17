import express from 'express';
import axios from 'axios';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import ngrok from 'ngrok';

const app = express();
const PORT = process.env.PORT || 4000;

const TOMTOM_API_KEY = '';
const TOMTOM_BASE = 'https://api.tomtom.com';

app.use(express.json());

// Load OpenAPI spec
const swaggerDocument = YAML.load('./openapi.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Utility to build TomTom URL
function buildUrl(path, queryParams = {}) {
  const url = new URL(TOMTOM_BASE + path);
  url.searchParams.append('key', TOMTOM_API_KEY);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined) url.searchParams.append(k, v);
  }
  return url.toString();
}

// ----------- Endpoints ------------

async function proxyRequest(url, res, isImage = false) {
  try {
    const response = await axios.get(url, { responseType: isImage ? 'arraybuffer' : 'json' });
    if (isImage) {
      res.contentType('image/png');
      res.send(response.data);
    } else {
      res.json(response.data);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 1️⃣ Geocode
app.get('/geocode', (req, res) => {
  const { query, limit, countrySet, language } = req.query;
  const url = buildUrl(`/search/2/geocode/${encodeURIComponent(query)}.json`, { limit, countrySet, language });
  proxyRequest(url, res);
});

// 2️⃣ Reverse Geocode
app.get('/reverseGeocode', (req, res) => {
  const { position, language } = req.query;
  const url = buildUrl(`/search/2/reverseGeocode/${position}.json`, { language });
  proxyRequest(url, res);
});

// 3️⃣ Fuzzy Search
app.get('/fuzzySearch', (req, res) => {
  const { query, limit, language } = req.query;
  const url = buildUrl(`/search/2/search/${encodeURIComponent(query)}.json`, { limit, language });
  proxyRequest(url, res);
});

// 4️⃣ POI Search
app.get('/poiSearch', (req, res) => {
  const { query, limit, lat, lon, radius } = req.query;
  const url = buildUrl(`/search/2/poiSearch/${encodeURIComponent(query)}.json`, { limit, lat, lon, radius });
  proxyRequest(url, res);
});

// 5️⃣ Nearby Search
app.get('/nearbySearch', (req, res) => {
  const { lat, lon, radius, limit } = req.query;
  const url = buildUrl(`/search/2/nearbySearch/.json`, { lat, lon, radius, limit });
  proxyRequest(url, res);
});

// 6️⃣ Calculate Route
app.get('/calculateRoute', (req, res) => {
  const { routePlanningLocations, contentType, language } = req.query;
  const url = buildUrl(`/routing/1/calculateRoute/${routePlanningLocations}/${contentType}`, { language });
  proxyRequest(url, res);
});

// 7️⃣ Reachable Range
app.get('/reachableRange', (req, res) => {
  const { origin, contentType } = req.query;
  const url = buildUrl(`/routing/1/calculateReachableRange/${origin}/${contentType}`, req.query);
  proxyRequest(url, res);
});

// 8️⃣ Traffic Incidents
app.get('/trafficIncidents', (req, res) => {
  const url = buildUrl(`/traffic/services/1/incidentDetails`, req.query);
  proxyRequest(url, res);
});

// 9️⃣ Static Map
app.get('/staticMap', (req, res) => {
  const url = buildUrl(`/map/1/staticimage`, req.query);
  proxyRequest(url, res, true);
});

// ------------- Start server + ngrok -------------
app.listen(PORT, async () => {
  console.log(`TomTom backend running on port ${PORT}`);

  try {
    const url = await ngrok.connect({
      addr: PORT,
      authtoken: process.env.NGROK_AUTHTOKEN, // optional
    });
    console.log(`ngrok public URL: ${url}`);
    console.log(`Swagger UI: ${url}/api-docs`);
  } catch (err) {
    console.error('Error starting ngrok:', err);
  }
});

