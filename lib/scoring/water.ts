export function computeWaterScore({
  tds,
  cl,
  ph,
}: {
  tds: number;
  cl: number;
  ph: number;
}): number {
  let tdsScore = 100;
  if (tds > 150 && tds <= 300) tdsScore = 90;
  else if (tds > 300 && tds <= 450) tdsScore = 75;
  else if (tds > 450 && tds <= 600) tdsScore = 55;
  else if (tds > 600 && tds <= 800) tdsScore = 35;
  else if (tds > 800) tdsScore = 15;

  let clScore = 100;
  if (cl > 0.5 && cl <= 1.5) clScore = 80;
  else if (cl > 1.5 && cl <= 3) clScore = 55;
  else if (cl > 3) clScore = 25;

  let phScore = 100;
  if (ph < 6.5) phScore = 40;
  else if (ph > 8.5 && ph <= 9.5) phScore = 80;
  else if (ph > 9.5) phScore = 30;

  return Math.round(tdsScore * 0.6 + clScore * 0.2 + phScore * 0.2);
}
