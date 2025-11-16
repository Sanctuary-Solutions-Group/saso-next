"use client";

import React, { useMemo } from "react";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

/**
 * Multi-stop gradient mapping:
 * 0   → dark red
 * 25  → red
 * 50  → orange
 * 75  → yellow
 * 100 → green
 */
function scoreToColor(score: number): string {
  const stops = [
    { stop: 0,   color: [192,   0,   0] }, // dark red
    { stop: 25,  color: [255,   0,   0] }, // red
    { stop: 50,  color: [255, 140,   0] }, // orange
    { stop: 75,  color: [255, 215,   0] }, // yellow
    { stop: 100, color: [ 15, 207,   0] }, // green
  ];

  const s = Math.max(0, Math.min(100, score));

  // find the two stops we are between
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    if (s >= a.stop && s <= b.stop) {
      const t = (s - a.stop) / (b.stop - a.stop);
      const r = Math.round(a.color[0] + (b.color[0] - a.color[0]) * t);
      const g = Math.round(a.color[1] + (b.color[1] - a.color[1]) * t);
      const bC = Math.round(a.color[2] + (b.color[2] - a.color[2]) * t);
      return `rgb(${r}, ${g}, ${bC})`;
    }
  }

  return "rgb(0,0,0)"; // fallback
}

export function MetricRing({
  percent,
  icon,
  size = 80,
}: {
  percent: number;
  icon?: React.ReactNode;
  size?: number;
}) {
  const value = Math.max(0, Math.min(100, percent));
  const dynamicColor = scoreToColor(value);

  const chartData = useMemo(
    () => [{ name: "score", value, fill: dynamicColor }],
    [value, dynamicColor]
  );

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          barSize={10}
          data={chartData}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <RadialBar
            background={{ fill: "#f1f5f9" }} // track gray
            dataKey="value"
            cornerRadius={8}
          />
        </RadialBarChart>
      </ResponsiveContainer>

      {/* Icon in the center */}
      {icon && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            width: size * 0.45,
            height: size * 0.45,
            color: dynamicColor,
          }}
        >
          {icon}
        </div>
      )}
    </div>
  );
}
