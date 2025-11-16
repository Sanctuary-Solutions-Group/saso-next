// lib/scoring/ether.ts

export function computeEtherScore({
  mag,
  electric,
  rf,
}: {
  mag: number;
  electric: number;
  rf: number;
}): number {
  // ----- Magnetic Field (mG) -----
  let magScore = 100;
  if (mag > 0.7 && mag <= 1.5) magScore = 85;
  else if (mag > 1.5 && mag <= 3) magScore = 70;
  else if (mag > 3 && mag <= 6) magScore = 40;
  else if (mag > 6) magScore = 15;

  // ----- Electric Field (V/m) -----
  let elecScore = 100;
  if (electric > 5 && electric <= 20) elecScore = 85;
  else if (electric > 20 && electric <= 50) elecScore = 70;
  else if (electric > 50 && electric <= 100) elecScore = 45;
  else if (electric > 100) elecScore = 20;

  // ----- RF (mW/m²) -----
  let rfScore = 100;
  if (rf > 1 && rf <= 10) rfScore = 85;
  else if (rf > 10 && rf <= 50) rfScore = 65;
  else if (rf > 50 && rf <= 200) rfScore = 40;
  else if (rf > 200) rfScore = 15;

  return Math.round((magScore + elecScore + rfScore) / 3);
}

export function etherLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 65) return "Moderate";
  if (score >= 40) return "Elevated";
  return "High";
}
