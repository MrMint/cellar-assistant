"use client";

import { useEffect, useId, useState } from "react";
import { FilterChip } from "@/components/app/FilterChip";
import { Schedule } from "@/components/app/icons";
import { Input } from "@/components/ui/input";
import {
  drankAtProblem,
  fromLocalInputValue,
  toLocalInputValue,
  whenLabel,
} from "./log-draft";

/**
 * "When" — a drink is logged **now** unless you say otherwise (X03's
 * backdating). Two chips: "Now" and the other time, which opens the device's
 * own date-and-time picker (`datetime-local`, so a phone shows its native
 * wheel). The time is checked against the server's own rule
 * (`parseDrankAt`) as it is chosen, so "the future" is said here and never
 * comes back as an error after the tap.
 *
 * `value` is an ISO instant, or `null` for now. `allowNow` is false when
 * editing an entry that already has a time: there "now" would be a change,
 * not a default, so the picker shows the entry's own time instead.
 */
export function WhenPicker({
  value,
  onChange,
  allowNow = true,
  onProblem,
  inline = false,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  allowNow?: boolean;
  /** Told whether the chosen time can be saved, so the caller can hold its button. */
  onProblem?: (problem: string | null) => void;
  /** The label at the row's left, chips beside it (the Pour sheet's rows). */
  inline?: boolean;
}) {
  const ids = useId();
  // The browser's clock, read after mount (the sheet's body only renders
  // once it is open, but the rule is cheap to keep).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [picking, setPicking] = useState(value !== null && allowNow);

  const problem = now === null ? null : drankAtProblem(value, now);
  useEffect(() => {
    onProblem?.(problem);
  }, [onProblem, problem]);

  const showInput = picking || !allowNow;

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${ids}-when`}>
      <div className={inline ? "flex items-center gap-3" : "contents"}>
        <h3
          id={`${ids}-when`}
          className={
            inline
              ? "t-cap m-0 w-14 shrink-0 font-normal text-ink-2"
              : "t-cap font-semibold"
          }
        >
          When
        </h3>
        {allowNow && (
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={value === null}
              onClick={() => {
                setPicking(false);
                onChange(null);
              }}
            >
              Now
            </FilterChip>
            <FilterChip
              selected={value !== null}
              icon={<Schedule aria-hidden />}
              aria-expanded={showInput}
              aria-controls={`${ids}-input`}
              onClick={() => {
                setPicking(true);
                if (value === null && now !== null) {
                  onChange(now.toISOString());
                }
              }}
            >
              {value === null || now === null
                ? "Earlier…"
                : whenLabel(value, now)}
            </FilterChip>
          </div>
        )}
      </div>
      {showInput && (
        <Input
          id={`${ids}-input`}
          type="datetime-local"
          aria-label="When you had it"
          value={value === null ? "" : toLocalInputValue(value)}
          max={now === null ? undefined : toLocalInputValue(now)}
          onChange={(event) => {
            const next = fromLocalInputValue(event.target.value);
            if (next !== null) onChange(next);
          }}
          className="h-11 w-full max-w-72"
        />
      )}
      {problem !== null && (
        <p role="alert" className="t-cap text-danger">
          {problem}
        </p>
      )}
    </section>
  );
}
