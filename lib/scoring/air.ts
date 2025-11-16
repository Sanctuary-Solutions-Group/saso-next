// --------------------------------------------------------
// SaSo Air Quality Scoring Engine v1.0
// --------------------------------------------------------
// Metrics included:
//   - CO2 (50%)
//   - PM2.5 (25%)
//   - PM10 (25%)
// Humidity is not scored, but a CAUTION flag is provided.
// --------------------------------------------------------

export function co2Score(ppm: number): number {
  if (ppm <= 700) return 100;                               // Excellent
  if (ppm <= 1000) return 100 - ((ppm - 700) / 300) * 20;  // 100 → 80
  if (ppm <= 1200) return 80 - ((ppm - 1000) / 200) * 20;  // 80 → 60
  if (ppm <= 1500) return 60 - ((ppm - 1200) / 300) * 30;  // 60 → 30
  if (ppm <= 2000) return 30 - ((ppm - 1500) / 500) * 20;  // 30 → 10

  return Math.max(0, 10 - ((ppm - 2000) / 500) * 10);       // 10 → 0
}

export function pm25Score(v: number): number {
  if (v <= 9) return 100;
  if (v <= 20) return 100 - ((v - 9) / 11) * 40;            // 100 → 60
  if (v <= 35) return 60 - ((v - 20) / 15) * 40;            // 60 → 20
  return Math.max(0, 20 - (v - 35) * 1.5);                  // 20 → 0
}

export function pm10Score(v: number): number {
  if (v <= 30) return 100;
  if (v <= 50) return 100 - ((v - 30) / 20) * 60;           // 100 → 40
  return Math.max(0, 40 - (v - 50) * 2);                    // 40 → 0
}

export function humidityCaution(h: number): boolean {
  return h < 40 || h > 60;
}

// Final weighted Air Score
export function computeAirScore({
  co2,
  pm25,
  pm10,
}: {
  co2: number;
  pm25: number;
  pm10: number;
}): number {
  const score =
    co2Score(co2) * 0.5 +
    pm25Score(pm25) * 0.25 +
    pm10Score(pm10) * 0.25;

  return Math.round(score);
}

// Optional human-readable labels for UI
export function co2Label(ppm: number): string {
  if (ppm <= 700) return "Excellent (Fresh Air)";
  if (ppm <= 1000) return "Good (Acceptable)";
  if (ppm <= 1200) return "Fair (Needs Attention)";
  if (ppm <= 1500) return "Poor (Ventilation Recommended)";
  if (ppm <= 2000) return "Very Poor (Unhealthy)";
  return "Severely Elevated (Action Required)";
}

export function pm25Label(v: number): string {
  if (v <= 9) return "Excellent";
  if (v <= 20) return "Moderate";
  if (v <= 35) return "Poor";
  return "Very Poor";
}

export function pm10Label(v: number): string {
  if (v <= 30) return "Excellent";
  if (v <= 50) return "Moderate";
  return "Poor";
}
