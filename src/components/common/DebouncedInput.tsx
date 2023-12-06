"use client";

import Input, { InputProps } from "@mui/joy/Input";
import { useRef } from "react";

type DebounceProps = {
  handleDebounce: (value: string) => void;
  debounceTimeout: number;
};

export const DebounceInput = (props: InputProps & DebounceProps) => {
  const { handleDebounce, debounceTimeout, ...rest } = props;

  const timerRef = useRef<number>();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      handleDebounce(event.target.value);
    }, debounceTimeout);
  };

  return <Input {...rest} onChange={handleChange} />;
};
