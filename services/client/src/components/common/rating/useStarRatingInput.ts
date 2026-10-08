"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useRef,
} from "react";
import { normalizeRating, ratingForKey, tapStar } from "./rating";

export type UseStarRatingInputOptions = {
  value: number | null | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
};

/**
 * The behaviour of the rating input, kept apart from its markup so the
 * shadcn migration (D20) swaps only the JSX.
 *
 * The control is ten native radios (one per half step) sharing one `name`,
 * which is what gives VoiceOver "3.5 stars, Good+, radio button, 7 of 10"
 * and Tab-into-the-checked-one for free. On top of that:
 *
 * - **Keys** go through `ratingForKey`, so arrows clamp instead of wrapping
 *   and Home/End/PageUp/PageDown work; focus follows the new value.
 * - **Taps** land on a whole star (a 44 pt target) and go through `tapStar`.
 *   The value is committed on `click` only — never on pointer-leave or hover,
 *   so sliding a thumb across the stars to scroll sets nothing.
 * - A click that *is* a radio's own (VoiceOver's double-tap, Space) bubbles
 *   to the star as well; the star ignores it, or it would be applied twice.
 */
export function useStarRatingInput({
  value,
  onChange,
  disabled = false,
}: UseStarRatingInputOptions) {
  const name = useId();
  const current = normalizeRating(value);
  const radios = useRef(new Map<number, HTMLInputElement>());

  const focusValue = useCallback((v: number) => {
    radios.current.get(v)?.focus({ preventScroll: true });
  }, []);

  const commit = useCallback(
    (next: number) => {
      if (disabled) return;
      if (next !== current) onChange(next);
    },
    [current, disabled, onChange],
  );

  const radioRef = useCallback(
    (v: number) => (el: HTMLInputElement | null) => {
      if (el === null) radios.current.delete(v);
      else radios.current.set(v, el);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (disabled) return;
      const next = ratingForKey(event.key, current);
      if (next === undefined) return;
      event.preventDefault();
      commit(next);
      focusValue(next);
    },
    [commit, current, disabled, focusValue],
  );

  const onStarClick = useCallback(
    (star: number) => (event: MouseEvent<HTMLElement>) => {
      if (disabled) return;
      const target = event.target as Element | null;
      if (target !== null && target.tagName === "INPUT") return;
      const next = tapStar(star, current);
      commit(next);
      focusValue(next);
    },
    [commit, current, disabled, focusValue],
  );

  const onRadioChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = normalizeRating(Number(event.currentTarget.value));
      if (next !== null) commit(next);
    },
    [commit],
  );

  return { name, current, radioRef, onKeyDown, onStarClick, onRadioChange };
}
