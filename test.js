import express from "express";
import { LRUCache } from "lru-cache";
import axios from "axios";
import ngrok from "ngrok";

// ---------------------- Express Setup ----------------------
const WEATHER_API_KEY = "";
const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 });

async function fetchWeather(city) {
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}`,
      { timeout: 5000 }
    );
    const data = {
      weatherTemperature: response.data.main.temp - 273.15,
      weatherRainfall: response.data.rain?.["1h"] || 0,
      wind: response.data.wind.speed,
      timestamp: new Date()
    };
    cache.set(`weather_${city}`, data);
    return { ...data, cached: false };
  } catch (err) {
    const cached = cache.get(`weather_${city}`) || { weatherTemperature: 0, weatherRainfall: 0, wind: 0, timestamp: new Date() };
    return { ...cached, cached: true };
  }
}

async function fetchSensorDataFromCoords(lat, lon) {
  try {
    const response = await axios.get(
      `https://api.opensensemap.org/boxes?bbox=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`,
      { timeout: 5000 }
    );
    const sensor = response.data[0]?.sensors || [];
    const data = {
      sensorAirQuality: sensor.find(s => s.title.includes("PM2.5"))?.lastMeasurement?.value || 0,
      sensorTemperature: sensor.find(s => s.title.includes("Temperature"))?.lastMeasurement?.value || 0,
      timestamp: new Date()
    };
    return { ...data, cached: false };
  } catch (err) {
    return { sensorAirQuality: 0, sensorTemperature: 0, timestamp: new Date(), cached: true };
  }
}

async function fetchSocioEconomicData(city) {
  try {
    const response = await axios.get("https://ghoapi.azureedge.net/api/MALARIA_EST_CASES", { timeout: 5000 });
    const data = {
      populationDensity: 5000,
      malariaCases: response.data.value[0]?.Value || 0,
      timestamp: new Date()
    };
    cache.set(`socioeconomic_${city}`, data);
    return { ...data, cached: false };
  } catch (err) {
    const cached = cache.get(`socioeconomic_${city}`) || { populationDensity: 5000, malariaCases: 0, timestamp: new Date() };
    return { ...cached, cached: true };
  }
}

// Express app
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Combined city endpoint
app.get("/city/:city", async (req, res) => {
  const city = req.params.city;
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  try {
    const [weather, socioeconomic] = await Promise.all([
      fetchWeather(city),
      fetchSocioEconomicData(city)
    ]);

    let sensor = { sensorAirQuality: 0, sensorTemperature: 0, timestamp: new Date(), cached: true };
    if (lat && lon) {
      sensor = await fetchSensorDataFromCoords(lat, lon);
    }

    res.json({ city, timestamp: new Date(), weather, sensor, socioeconomic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root endpoint
app.get("/", (req, res) => res.json({ event: "server_started", message: "Express MCP-like Server running" }));

// ---------------------- Start Express & ngrok ----------------------
app.listen(PORT, async () => {
  console.log(`Express server running on http://localhost:${PORT}`);

  try {
    const url = await ngrok.connect(PORT);
    console.log(`\n🌐 ngrok tunnel started!`);
    console.log(`Public OpenAPI URL: ${url}`);
    console.log(`Example: ${url}/city/Delhi?lat=28.61&lon=77.23`);
  } catch (err) {
    console.error("Error starting ngrok:", err);
  }
});

