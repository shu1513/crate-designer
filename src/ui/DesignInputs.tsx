import { useState, type ChangeEvent } from "react";
import { MESSAGES } from "../core/errors.ts";

interface Props {
  disabled: boolean;
  busy: boolean;
  onDesign: (quantity: number, weightKg: number) => void;
  onChange: () => void;
  unit: "mm" | "in";
}

/** Quantity and weight fields with the "Design crate" button (SPEC R3, E3, E4, R23). */
export function DesignInputs({ disabled, busy, onDesign, onChange, unit }: Props) {
  const [quantityText, setQuantityText] = useState("1");
  const [weightText, setWeightText] = useState("");

  const quantity = Number(quantityText);
  const quantityOk = quantityText.trim() !== "" && Number.isInteger(quantity) && quantity >= 1;
  const weightEntered = Number(weightText);
  const weightOk = weightText.trim() !== "" && Number.isFinite(weightEntered) && weightEntered > 0;
  // Weight is typed in the display unit; the design always works in kilograms.
  const weightKg = unit === "in" ? weightEntered / 2.20462 : weightEntered;

  const change = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    onChange();
  };

  return (
    <div className="design-inputs">
      <label className="field">
        Quantity in this crate
        <input type="number" min={1} step={1} value={quantityText} onChange={change(setQuantityText)} />
        {quantityText !== "" && !quantityOk && <span className="error">{MESSAGES.E3}</span>}
      </label>
      <label className="field">
        Weight of one part ({unit === "in" ? "lb" : "kg"})
        <input type="number" min={0} step="any" value={weightText} onChange={change(setWeightText)} placeholder={unit === "in" ? "e.g. 59.5" : "e.g. 27"} />
        {weightText !== "" && !weightOk && <span className="error">{MESSAGES.E4}</span>}
      </label>
      <button className="primary" disabled={disabled || busy || !quantityOk || !weightOk} onClick={() => onDesign(quantity, weightKg)}>
        {busy ? "Designing…" : "Design crate"}
      </button>
    </div>
  );
}
