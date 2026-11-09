import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MESSAGES } from "../core/errors.ts";

interface Props {
  disabled: boolean;
  busy: boolean;
  onDesign: (quantity: number, weightKg: number) => void;
  onChange: () => void;
  unit: "mm" | "in";
  /** From a matched parts-list entry (R29): prefills the weight and offers the quantities. */
  suggested: { id: string; weightKg: number; quantities: number[] } | null;
}

/** Quantity and weight fields with the "Design crate" button (SPEC R3, E3, E4, R23). */
export function DesignInputs({ disabled, busy, onDesign, onChange, unit, suggested }: Props) {
  const [quantityText, setQuantityText] = useState("1");
  const [weightText, setWeightText] = useState("");
  // When a dropped GLB matches a parts-list entry, prefill the weight (in the current unit) and first quantity.
  const lastSuggested = useRef<string | null>(null);
  useEffect(() => {
    const key = suggested ? `${suggested.id}:${suggested.weightKg}` : null;
    if (key === lastSuggested.current) return;
    lastSuggested.current = key;
    if (!suggested) return;
    const shown = unit === "in" ? suggested.weightKg * 2.20462 : suggested.weightKg;
    setWeightText(String(Math.round(shown * 100) / 100));
    if (suggested.quantities[0]) setQuantityText(String(suggested.quantities[0]));
    onChange();
  }, [suggested, unit, onChange]);
  // The weight the builder typed, kept in kilograms, so a unit toggle converts the field instead of re-reading it.
  const weightKgRef = useRef<number | null>(null);
  const lastUnit = useRef(unit);
  useEffect(() => {
    if (lastUnit.current === unit) return;
    lastUnit.current = unit;
    if (weightKgRef.current !== null) {
      const shown = unit === "in" ? weightKgRef.current * 2.20462 : weightKgRef.current;
      setWeightText(String(Math.round(shown * 100) / 100));
    }
  }, [unit]);

  const quantity = Number(quantityText);
  const quantityOk = quantityText.trim() !== "" && Number.isInteger(quantity) && quantity >= 1;
  const weightEntered = Number(weightText);
  const weightOk = weightText.trim() !== "" && Number.isFinite(weightEntered) && weightEntered > 0;
  // Weight is typed in the display unit; the design always works in kilograms.
  const weightKg = unit === "in" ? weightEntered / 2.20462 : weightEntered;
  weightKgRef.current = weightOk ? weightKg : null;

  const change = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    onChange(); // a typed change invalidates the design; a unit toggle (handled above) does not
  };

  return (
    <div className="design-inputs">
      <label className="field">
        Quantity in this crate
        <input type="number" min={1} step={1} value={quantityText} onChange={change(setQuantityText)} />
        {suggested && suggested.quantities.length > 0 && (
          <span className="chips">
            {suggested.quantities.map((q) => (
              <button key={q} type="button" className={Number(quantityText) === q ? "chip active" : "chip"} onClick={() => { setQuantityText(String(q)); onChange(); }}>{q}</button>
            ))}
          </span>
        )}
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
