// lib/scoring/airSummary.ts

export function summarizeAir({ CO2, PM25, PM10 }: any): string {
  const co2 = CO2 ?? 0;
  const pm25 = PM25 ?? 0;
  const pm10 = PM10 ?? 0;

  // Perfect case
  if (co2 <= 700 && pm25 <= 9 && pm10 <= 30) {
    return "Air quality is excellent across all measured pollutants.";
  }

  let parts: string[] = [];

  // ---- CO₂ ----
  if (co2 <= 700) parts.push("CO₂ excellent");
  else if (co2 <= 1000) parts.push("CO₂ acceptable");
  else if (co2 <= 1200) parts.push("CO₂ elevated");
  else if (co2 <= 1500) parts.push("CO₂ high");
  else parts.push("CO₂ very high");

  // ---- PM2.5 ----
  if (pm25 <= 9) parts.push("PM₂.₅ ideal");
  else if (pm25 <= 20) parts.push("PM₂.₅ moderately elevated");
  else if (pm25 <= 35) parts.push("PM₂.₅ elevated");
  else parts.push("PM₂.₅ high");

  // ---- PM10 ----
  if (pm10 <= 30) parts.push("PM₁₀ ideal");
  else if (pm10 <= 50) parts.push("PM₁₀ moderate");
  else parts.push("PM₁₀ elevated");

  return parts.join("; ") + ".";
}
