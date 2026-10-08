"use client";

import { type ComponentProps, type ReactNode, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type DebounceProps = {
  handleDebounce: (value: string) => void;
  debounceTimeout: number;
  /**
   * The old Joy `Input` sizes, kept so callers need not change: `md` is the
   * 44 px default, `lg` 48 px, `sm` 36 px. (Not the native `size` attribute.)
   */
  size?: "sm" | "md" | "lg";
  /** Joy's decorators, kept: drawn inside the field, before / after the text. */
  startDecorator?: ReactNode;
  endDecorator?: ReactNode;
};

const SIZE = {
  sm: "h-9",
  md: undefined,
  lg: "h-12",
} as const;

/**
 * A text input that reports its value `debounceTimeout` ms after the last
 * keystroke (`handleDebounce`), and every keystroke through `onChange` as
 * usual. `ui/input`, or `ui/input-group` when it has a decorator.
 */
export const DebounceInput = (
  props: Omit<ComponentProps<typeof Input>, "size"> & DebounceProps,
) => {
  const {
    handleDebounce,
    debounceTimeout,
    onChange,
    size = "md",
    startDecorator,
    endDecorator,
    className,
    ...rest
  } = props;

  const timerRef = useRef<number | undefined>(undefined);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    // Call the original onChange immediately for visual updates
    if (onChange) {
      onChange(event);
    }

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set up debounced callback
    timerRef.current = window.setTimeout(() => {
      handleDebounce(value);
    }, debounceTimeout);
  };

  const hasStart = startDecorator !== undefined && startDecorator !== null;
  const hasEnd = endDecorator !== undefined && endDecorator !== null;

  if (!hasStart && !hasEnd) {
    return (
      <Input
        {...rest}
        className={cn(SIZE[size], size === "lg" && "md:text-base", className)}
        onChange={handleChange}
      />
    );
  }

  return (
    <InputGroup className={cn(SIZE[size], className)}>
      <InputGroupInput
        {...rest}
        className={cn("h-full", size === "lg" && "md:text-base")}
        onChange={handleChange}
      />
      {hasStart && <InputGroupAddon>{startDecorator}</InputGroupAddon>}
      {hasEnd && (
        <InputGroupAddon align="inline-end">{endDecorator}</InputGroupAddon>
      )}
    </InputGroup>
  );
};
