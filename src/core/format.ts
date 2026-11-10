/**
 * Display formatting (SPEC R20). All internal numbers are millimetres and kilograms;
 * step text carries tokens like {{mm:1574}} or {{kg:27}} that are rendered here.
 */
export type DisplayUnit = "mm" | "in";

/** Inches to the nearest 1/16; under one inch to the nearest 1/32, so a 1 mm limit does not read as 1/16 in (1.6 mm). */
export function formatLength(mm: number, unit: DisplayUnit): string {
  if (unit === "mm") return `${Math.round(mm)} mm`;
  const inches = mm / 25.4;
  const whole = Math.floor(inches);
  const parts = inches < 1 ? 32 : 16;
  let num = Math.round((inches - whole) * parts);
  let den = parts;
  let w = whole;
  if (num === parts) { w += 1; num = 0; }
  if (num === 0) return `${w} in`;
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return w === 0 ? `${num}/${den} in` : `${w} ${num}/${den} in`;
}

export function formatWeight(kg: number, unit: DisplayUnit): string {
  return unit === "mm" ? `${Math.round(kg * 2) / 2} kg` : `${Math.round(kg * 2.20462 * 2) / 2} lb`;
}

/** Replaces {{mm:N}} and {{kg:N}} tokens with formatted values. */
export function renderText(text: string, unit: DisplayUnit): string {
  return text.replace(/\{\{(mm|kg):([-\d.]+)\}\}/g, (_m, kind: string, n: string) =>
    kind === "mm" ? formatLength(Number(n), unit) : formatWeight(Number(n), unit));
}

/** Word count for the R18 rule: a {{token}} counts as one word. */
export function wordCount(text: string): number {
  return text.replace(/\{\{[^}]*\}\}/g, "X").trim().split(/\s+/).filter(Boolean).length;
}
