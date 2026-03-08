/**
 * Weather API - San Luis Obispo
 * GET /api/weather
 * Uses Open-Meteo (free, no API key)
 */
import { NextResponse } from 'next/server';
import { parseOpenMeteoWeather, WEATHER_API_URL, type WeatherData } from '@/lib/weather';

// Cache weather data for 10 minutes
let cache: { data: WeatherData; ts: number } | null = null;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET() {
  // Return cache if valid
  if (cache && Date.now() - cache.ts < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch(WEATHER_API_URL, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Weather upstream returned ${res.status}`);
    }

    const json = await res.json();
    const data = parseOpenMeteoWeather(json);

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { "x-weather-cache": "stale" },
      });
    }

    const isExpectedNetworkFailure =
      error instanceof Error &&
      /fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|network/i.test(error.message);

    if (!isExpectedNetworkFailure) {
      console.error("[weather] Error:", error);
    }

    return NextResponse.json({ error: "Weather temporarily unavailable" }, { status: 503 });
  }
}
