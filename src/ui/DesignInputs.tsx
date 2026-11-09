import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MESSAGES } from "../core/errors.ts";

interface Props {
  disabled: boolean;
  busy: boolean;
  onDesign: (quantity: number, weightKg: number) => void;
  onChange: () => void;
  unit: "mm" | "in";
  /** From a matched parts-list entry (R29): prefills untouched fields and offers the quantities. */
  suggested: { id: string; weightKg: number; quantities: number[] } | null;
}

const LB_PER_KG = 2.20462;

/** Quantity and weight fields with the "Design crate" button (SPEC R3, E3, E4, R23, R29). */
export function DesignInputs({ disabled, busy, onDesign, onChange, unit, suggested }: Props) {
  const [quantityText, setQuantityText] = useState("1");
  const [weightText, setWeightText] = useState("");
  // Which fields the builder has typed into; a parts-list match only prefills untouched fields.
  const touched = useRef({ quantity: false, weight: false });
  // The weight in kilograms, updated only when typed or prefilled, so a unit toggle converts the
  // field from this value instead of re-reading the text in the new unit.
  const weightKgRef = useRef<number | null>(null);
  const shown = (kg: number, u: "mm" | "in") => String(Math.round((u === "in" ? kg * LB_PER_KG : kg) * 100) / 100);

  const lastUnit = useRef(unit);
  useEffect(() => {
    if (lastUnit.current === unit) return;
    lastUnit.current = unit;
    if (weightKgRef.current !== null) setWeightText(shown(weightKgRef.current, unit));
  }, [unit]);

  const lastSuggested = useRef<string | null>(null);
  useEffect(() => {
    const key = suggested ? `${suggested.id}:${suggested.weightKg}` : null;
    if (key === lastSuggested.current) return;
    lastSuggested.current = key;
    if (!suggested) return;
    let changed = false;
    if (!touched.current.weight) { weightKgRef.current = suggested.weightKg; setWeightText(shown(suggested.weightKg, unit)); changed = true; }
    if (!touched.current.quantity && suggested.quantities[0]) { setQuantityText(String(suggested.quantities[0])); changed = true; }
    if (changed) onChange();
  }); // runs after every render; the key check makes it act once per new match

  const quantity = Number(quantityText);
  const quantityOk = quantityText.trim() !== "" && Number.isInteger(quantity) && quantity >= 1;
  const weightEntered = Number(weightText);
  const weightOk = weightText.trim() !== "" && Number.isFinite(weightEntered) && weightEntered > 0;
  // Weight is typed in the display unit; the design always works in kilograms.
  const weightKg = unit === "in" ? weightEntered / LB_PER_KG : weightEntered;

  function onQuantityChange(e: ChangeEvent<HTMLInputElement>) {
    touched.current.quantity = true;
    setQuantityText(e.target.value);
    onChange();
  }
  function pickQuantity(q: number) {
    touched.current.quantity = true;
    setQuantityText(String(q));
    onChange();
  }
  function onWeightChange(e: ChangeEvent<HTMLInputElement>) {
    touched.current.weight = true;
    const v = Number(e.target.value);
    weightKgRef.current = e.target.value.trim() !== "" && Number.isFinite(v) && v > 0 ? (unit === "in" ? v / LB_PER_KG : v) : null;
    setWeightText(e.target.value);
    onChange(); // a typed change invalidates the design; a unit toggle (handled above) does not
  }

  return (
    <div className="design-inputs">
      <label className="field">
        Quantity in this crate
        <input type="number" min={1} step={1} value={quantityText} onChange={onQuantityChange} />
        {suggested && suggested.quantities.length > 0 && (
          <span className="chips">
            {suggested.quantities.map((q) => (
              <button key={q} type="button" className={Number(quantityText) === q ? "chip active" : "chip"} onClick={() => pickQuantity(q)}>{q}</button>
            ))}
          </span>
        )}
        {quantityText !== "" && !quantityOk && <span className="error">{MESSAGES.E3}</span>}
      </label>
      <label className="field">
        Weight of one part ({unit === "in" ? "lb" : "kg"})
        <input type="number" min={0} step="any" value={weightText} onChange={onWeightChange} placeholder={unit === "in" ? "e.g. 59.5" : "e.g. 27"} />
        {weightText !== "" && !weightOk && <span className="error">{MESSAGES.E4}</span>}
      </label>
      <button className="primary" disabled={disabled || busy || !quantityOk || !weightOk} onClick={() => onDesign(quantity, weightKg)}>
        {busy ? "Designing…" : "Design crate"}
      </button>
    </div>
  );
}
