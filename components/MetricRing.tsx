"use client";
import React from "react";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

/**
 * MetricRing – small circular visual gauge for metric intensity
 * Works best between 0–100% fill.
 */
export function MetricRing({
  percent,
  color,
}: {
  percent: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const data = [{ name: "metric", value: clamped, fill: color }];

  return (
    <div className="relative flex items-center justify-center">
      <ResponsiveContainer width={56} height={56}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          barSize={8}
          data={data}
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
            background={{ fill: "#f1f5f9" }} // subtle gray track
            dataKey="value"
            cornerRadius={10}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
