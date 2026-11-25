import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePath = resolve(root, "docs/design-mockups/c-studio-vivid.html");
const outputDir = resolve(root, "docs/design-mockups");
const source = readFileSync(sourcePath, "utf8");

const palettes = [
  {
    file: "d-deep-teal-professional.html",
    title: "Direction D1 · Deep Teal Professional",
    replacements: {
      "#eef1f5": "#eef5f5", "#ffffff": "#fbfdfd", "#14181f": "#172326",
      "#55606f": "#4d6267", "#8a94a2": "#7a9297", "#aab2be": "#a5b9bc",
      "#e8ecf1": "#dce8e9", "#f0f3f7": "#edf4f4", "#f5f7fa": "#f1f7f7",
      "#10a37f": "#087f82", "#0b7d61": "#05666a", "#e4f5ef": "#dff3f2",
      "#16b98f": "#159da0", "#0b8a68": "#05666a", "#f4faf7": "#f2faf9",
      "#eef6f2": "#e7f4f3", "#dbeee6": "#cde7e6", "#d7e9e1": "#cae7e5",
      "rgba(16,163,127,.55)": "rgba(8,127,130,.42)", "rgba(16,163,127,.14)": "rgba(8,127,130,.14)",
      "rgba(16,163,127,.6)": "rgba(8,127,130,.46)", "#3ddc97": "#78d7c7",
    },
  },
  {
    file: "d-warm-orange-energy.html",
    title: "Direction D2 · Warm Orange Energy",
    replacements: {
      "#eef1f5": "#f6f1ea", "#ffffff": "#fffdf9", "#14181f": "#2a211a",
      "#55606f": "#6c5849", "#8a94a2": "#a48d7b", "#aab2be": "#bfae9f",
      "#e8ecf1": "#eee1d4", "#f0f3f7": "#f8f0e7", "#f5f7fa": "#fbf4ed",
      "#10a37f": "#cb642e", "#0b7d61": "#a84e22", "#e4f5ef": "#fbe8dc",
      "#16b98f": "#e27b3c", "#0b8a68": "#a84e22", "#f4faf7": "#fff8f1",
      "#eef6f2": "#fdf0e5", "#dbeee6": "#f0dac8", "#d7e9e1": "#f2d8c6",
      "rgba(16,163,127,.55)": "rgba(203,100,46,.42)", "rgba(16,163,127,.14)": "rgba(203,100,46,.14)",
      "rgba(16,163,127,.6)": "rgba(203,100,46,.46)", "#3ddc97": "#ffd098",
    },
  },
  {
    file: "d-navy-blue-composure.html",
    title: "Direction D3 · Navy Blue Composure",
    replacements: {
      "#eef1f5": "#eff3f8", "#ffffff": "#fbfcfe", "#14181f": "#172130",
      "#55606f": "#526477", "#8a94a2": "#8292a5", "#aab2be": "#abb8c5",
      "#e8ecf1": "#dce5ef", "#f0f3f7": "#edf2f7", "#f5f7fa": "#f3f6fa",
      "#10a37f": "#2867a9", "#0b7d61": "#1e528d", "#e4f5ef": "#e4eef9",
      "#16b98f": "#3d7cbd", "#0b8a68": "#1e528d", "#f4faf7": "#f4f8fc",
      "#eef6f2": "#eaf1f9", "#dbeee6": "#d5e2f1", "#d7e9e1": "#d3e0f0",
      "rgba(16,163,127,.55)": "rgba(40,103,169,.42)", "rgba(16,163,127,.14)": "rgba(40,103,169,.14)",
      "rgba(16,163,127,.6)": "rgba(40,103,169,.46)", "#3ddc97": "#93c5fd",
    },
  },
  {
    file: "d-rose-warm-gray.html",
    title: "Direction D4 · Rose Warm Gray",
    replacements: {
      "#eef1f5": "#f5f0f1", "#ffffff": "#fffafb", "#14181f": "#2a1d23",
      "#55606f": "#705764", "#8a94a2": "#a58a97", "#aab2be": "#beaab2",
      "#e8ecf1": "#eedfe4", "#f0f3f7": "#f8eff2", "#f5f7fa": "#fcf4f6",
      "#10a37f": "#b84d68", "#0b7d61": "#943b53", "#e4f5ef": "#f8e5eb",
      "#16b98f": "#cd6680", "#0b8a68": "#943b53", "#f4faf7": "#fff7f9",
      "#eef6f2": "#fdeef2", "#dbeee6": "#f1d8e0", "#d7e9e1": "#f2d3dd",
      "rgba(16,163,127,.55)": "rgba(184,77,104,.42)", "rgba(16,163,127,.14)": "rgba(184,77,104,.14)",
      "rgba(16,163,127,.6)": "rgba(184,77,104,.46)", "#3ddc97": "#f7a8ba",
    },
  },
];

mkdirSync(outputDir, { recursive: true });
for (const palette of palettes) {
  let html = source.replace("Direction C · Studio Vivid", palette.title);
  for (const [from, to] of Object.entries(palette.replacements)) html = html.replaceAll(from, to);
  writeFileSync(resolve(outputDir, palette.file), html);
}

console.log(`Generated ${palettes.length} palette mockups.`);
