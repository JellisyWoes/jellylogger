// Helper to convert user color input to ANSI escape code using Bun.color with fallback
export function toAnsiColor(color?: string, fallback: string = ""): string {
  if (!color) return fallback;
  // If already an ANSI escape code, just return
  if (color.startsWith("\x1b[")) return color;
  // Try to use Bun.color for hex, rgb, hsl, hsv, cmyk, etc.
  try {
    const result = Bun.color(color, "ansi");
    if (result) return result;
    console.warn(`Invalid color "${color}", using fallback`);
    return fallback;
  } catch (e) {
    console.warn(`Failed to parse color "${color}": ${e instanceof Error ? e.message : String(e)}, using fallback`);
    return fallback;
  }
}
