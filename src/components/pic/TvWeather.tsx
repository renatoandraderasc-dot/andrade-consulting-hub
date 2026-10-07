import { useEffect, useState } from "react";
import { CloudSun, CloudRain, Sun, Cloud } from "lucide-react";

type Weather = { temperature: number; min: number; max: number; code: number };

/** Local weather is optional and never blocks the monitor or its store data. */
export default function TvWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    navigator.geolocation?.getCurrentPosition(async ({ coords }) => {
      try {
        const query = new URLSearchParams({
          latitude: String(coords.latitude), longitude: String(coords.longitude),
          current: "temperature_2m,weather_code", daily: "temperature_2m_max,temperature_2m_min",
          timezone: "auto", forecast_days: "1",
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (active && typeof data.current?.temperature_2m === "number") setWeather({
          temperature: data.current.temperature_2m, code: data.current.weather_code,
          min: data.daily.temperature_2m_min[0], max: data.daily.temperature_2m_max[0],
        });
      } catch { /* Weather unavailable: keep the monitor usable. */ }
    }, () => {}, { timeout: 8000, maximumAge: 3600000 });
    return () => { active = false; controller.abort(); };
  }, []);
  const Icon = !weather ? CloudSun : weather.code >= 51 ? CloudRain : weather.code === 0 ? Sun : Cloud;
  return <div className="tv-weather" aria-label="Previsão do tempo local">
    <Icon className="h-6 w-6 text-primary shrink-0" />
    {weather ? <div><span className="font-semibold text-foreground">{Math.round(weather.temperature)}°C</span>
      <span className="ml-2">Hoje {Math.round(weather.min)}° / {Math.round(weather.max)}°</span></div>
      : <span>Tempo local indisponível</span>}
  </div>;
}