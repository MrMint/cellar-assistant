"use client";

import Input, { type InputProps } from "@mui/joy/Input";
import { useRef } from "react";

type DebounceProps = {
  handleDebounce: (value: string) => void;
  debounceTimeout: number;
};

export const DebounceInput = (props: InputProps & DebounceProps) => {
  const { handleDebounce, debounceTimeout, onChange, ...rest } = props;

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

  return <Input {...rest} onChange={handleChange} />;
};
