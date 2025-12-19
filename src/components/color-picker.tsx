import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

// Colorblind-friendly palette based on Paul Tol's vibrant qualitative scheme
// These colors are designed to be distinguishable for people with
// protanopia, deuteranopia, and tritanopia
const PRESET_COLORS = [
  "#0173B2", // Strong Blue - distinguishable by all
  "#029E73", // Teal Green - safe for protanopia/deuteranopia
  "#D55E00", // Vermillion/Orange - safe for all types
  "#CC78BC", // Reddish Purple - distinguishable
  "#CA9161", // Brown/Tan - safe alternative
  "#FBAFE4", // Light Pink - high contrast
  "#949494", // Gray - neutral
  "#ECE133", // Yellow - high visibility
  "#56B4E9", // Sky Blue - distinct from strong blue
  "#DE8F05", // Amber - warm alternative
  "#F0E442", // Light Yellow - very visible
  "#E69F00", // Orange Yellow
];

function generateRandomColor(): string {
  // Generate a vibrant random color
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.floor(Math.random() * 25); // 65-90%
  const lightness = 45 + Math.floor(Math.random() * 15); // 45-60%

  // Convert HSL to hex
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2 max-w-fit">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`w-8 h-8 rounded-md transition-all hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? "ring-2 ring-offset-2 ring-foreground"
                : ""
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-md border"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 text-sm border rounded-md"
          placeholder="#0173B2"
          pattern="^#[0-9A-Fa-f]{6}$"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(generateRandomColor())}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
