// lib/scoring/etherSummary.ts

export function summarizeEther({ MagField, ElectricField, RF }: any): string {
  const mag = MagField ?? 0;
  const elec = ElectricField ?? 0;
  const rf = RF ?? 0;

  // Perfect case
  if (mag < 1 && elec < 5 && rf < 1) {
    return "Magnetic, electric, and RF fields are all extremely low.";
  }

  let parts: string[] = [];

  // ---- Magnetic ----
  if (mag < 1) parts.push("Magnetic fields low");
  else if (mag < 3) parts.push("Magnetic fields moderately elevated");
  else parts.push("Magnetic fields elevated");

  // ---- Electric ----
  if (elec < 5) parts.push("Electric fields low");
  else if (elec < 20) parts.push("Electric fields elevated");
  else parts.push("Electric fields high");

  // ---- RF ----
  if (rf < 1) parts.push("RF exposure low");
  else if (rf < 10) parts.push("RF moderately elevated");
  else if (rf < 50) parts.push("RF elevated");
  else parts.push("RF high relative to typical indoor levels");

  return parts.join("; ") + ".";
}
