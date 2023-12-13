import Button from "@mui/joy/Button";
import { useColorScheme } from "@mui/joy/styles";

function ThemeToggle() {
  const { mode, setMode } = useColorScheme();
  return (
    <Button
      variant="outlined"
      color="neutral"
      onClick={() => setMode(mode === "dark" ? "light" : "dark")}
    >
      {mode === "dark" ? "Turn light" : "Turn dark"}
    </Button>
  );
}

export default ThemeToggle;
