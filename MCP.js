import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import { LRUCache } from "lru-cache";

// --- Configuration ---
const WEATHER_API_KEY = "";
const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 }); // 15 minutes

// --- Fetch Functions ---
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
  } catch {
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
  } catch {
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
  } catch {
    const cached = cache.get(`socioeconomic_${city}`) || { populationDensity: 5000, malariaCases: 0, timestamp: new Date() };
    return { ...cached, cached: true };
  }
}

// --- MCP Server Setup ---
const server = new McpServer({ name: "city-data-server", version: "1.0.0" });

// --- Tools ---
server.registerTool("add", {
  title: "Addition Tool",
  description: "Add two numbers",
  inputSchema: { a: z.number(), b: z.number() }
}, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }]
}));

// --- Resources ---
// Weather
server.registerResource("weather", new ResourceTemplate("weather://{city}", { list: undefined }), {
  title: "Weather Data",
  description: "Weather info for a city"
}, async (uri, { city }) => {
  const data = await fetchWeather(city);
  return { contents: [{ uri: uri.href, text: JSON.stringify(data), mimeType: "application/json" }] };
});

// Sensor
server.registerResource("sensor", new ResourceTemplate("sensor://{lat},{lon}", { list: undefined }), {
  title: "Sensor Data",
  description: "Sensor readings by coordinates"
}, async (uri, { lat, lon }) => {
  const data = await fetchSensorDataFromCoords(lat, lon);
  return { contents: [{ uri: uri.href, text: JSON.stringify(data), mimeType: "application/json" }] };
});

// Socioeconomic
server.registerResource("socioeconomic", new ResourceTemplate("socioeconomic://{city}", { list: undefined }), {
  title: "Socioeconomic Data",
  description: "Socioeconomic data for a city"
}, async (uri, { city }) => {
  const data = await fetchSocioEconomicData(city);
  return { contents: [{ uri: uri.href, text: JSON.stringify(data), mimeType: "application/json" }] };
});

// Combined City Data
server.registerResource("city-data", new ResourceTemplate("city-data://{city}?lat={lat}&lon={lon}", { list: undefined }), {
  title: "Combined City Data",
  description: "Weather + Sensor + Socioeconomic for a city"
}, async (uri, { city, lat, lon }) => {
  const [weather, socioeconomic] = await Promise.all([
    fetchWeather(city),
    fetchSocioEconomicData(city)
  ]);
  let sensor = { sensorAirQuality: 0, sensorTemperature: 0, cached: true };
  if (lat && lon) sensor = await fetchSensorDataFromCoords(lat, lon);

  return { contents: [{ uri: uri.href, text: JSON.stringify({ city, weather, socioeconomic, sensor }), mimeType: "application/json" }] };
});

// --- Start MCP Transport ---
const transport = new StdioServerTransport();
await server.connect(transport);
console.log(JSON.stringify({ event: "server_started", message: "Standalone MCP Server running on stdio" }));




//npx @modelcontextprotocol/inspector "D:\ruff\MCP.js" --stdio
