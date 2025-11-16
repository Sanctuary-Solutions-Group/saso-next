// lib/scoring/waterSummary.ts

export function summarizeWater({ TDS, Cl, pH }: any): string {
  const tds = TDS ?? 0;
  const chlorine = Cl ?? 0;
  const ph = pH ?? null;

  // Perfect case
  if (tds >= 150 && tds <= 300 && chlorine <= 0.5) {
    return "Mineral-balanced; excellent for taste and hydration.";
  }

  let parts: string[] = [];

  // ---- TDS ----
  if (tds < 150) parts.push("Very low TDS (lacks beneficial minerals)");
  else if (tds <= 300) parts.push("Mineral-balanced");
  else if (tds <= 450) parts.push("Moderate TDS (slightly mineral-forward)");
  else if (tds <= 600) parts.push("Hard water (suboptimal)");
  else parts.push("High TDS (taste and scaling impacted)");

  // ---- Chlorine ----
  if (chlorine > 1.5) parts.push("Chlorine elevated");
  else if (chlorine > 0.8) parts.push("Chlorine moderate");
  else parts.push("Chlorine low");

  // ---- pH ----
  if (ph !== null) {
    if (ph < 6.5) parts.push("pH acidic");
    else if (ph > 9) parts.push("pH alkaline");
  }

  return parts.join("; ") + ".";
}
