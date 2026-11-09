import { createContext, useContext } from "react";
import { formatLength, formatWeight, renderText, type DisplayUnit } from "../core/format.ts";

export const UnitContext = createContext<DisplayUnit>("mm");

/** Display helpers bound to the current unit (SPEC R20). */
export function useUnits() {
  const unit = useContext(UnitContext);
  return {
    unit,
    len: (mm: number) => formatLength(mm, unit),
    kg: (kg: number) => formatWeight(kg, unit),
    text: (t: string) => renderText(t, unit),
    size: (L: number, W: number, H: number) => `${formatLength(L, unit)} × ${formatLength(W, unit)} × ${formatLength(H, unit)}`,
  };
}
