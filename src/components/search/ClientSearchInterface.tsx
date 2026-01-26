"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/joy";
import { useActor } from "@xstate/react";
import { useRouter, useSearchParams } from "next/navigation";
import { includes } from "ramda";
import { useEffect, useState } from "react";
import { MdCamera, MdScanner, MdSearch } from "react-icons/md";
import {
  barcodeSearchAction,
  imageSearchAction,
} from "@/app/(authenticated)/search/actions";
import { BarcodeScanner } from "../common/BarcodeScanner";
import { CameraCapture } from "../common/CameraCapture";
import { DebounceInput } from "../common/DebouncedInput";
import { interactiveSearchMachine } from "./actors/interactiveSearch";

interface ClientSearchInterfaceProps {
  initialQuery?: string;
}

export const ClientSearchInterface = ({
  initialQuery,
}: ClientSearchInterfaceProps) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery || "");
  const searchParams = useSearchParams();
  const router = useRouter();

  const [state, send] = useActor(interactiveSearchMachine, {
    input: {},
  });

  // Update search input when URL changes
  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    setSearchQuery(urlQuery);
  }, [searchParams]);

  const handleInputChange = (value: string) => {
    setSearchQuery(value);

    // Debounced URL update - navigate to search with query
    if (value.trim()) {
      router.push(`/search?q=${encodeURIComponent(value.trim())}`);
    } else {
      router.push("/search");
    }
  };

  return (
    <Box>
      {!includes(state.value, ["barcode", "image"]) && (
        <Stack spacing={2}>
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }}>
            <DebounceInput
              autoFocus
              startDecorator={<MdSearch />}
              placeholder="Search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              handleDebounce={handleInputChange}
              debounceTimeout={300}
            />
            <Stack direction="row" spacing={2} minWidth="280px">
              <Button
                variant="outlined"
                fullWidth
                color="neutral"
                startDecorator={<MdScanner />}
                onClick={() => send({ type: "SEARCH_BARCODE" })}
              >
                Scan Barcode
              </Button>
              <Button
                variant="outlined"
                fullWidth
                color="neutral"
                startDecorator={<MdCamera />}
                onClick={() => send({ type: "SEARCH_IMAGE" })}
              >
                Take Picture
              </Button>
            </Stack>
          </Stack>

          {includes(state.value, ["barcodeSearching", "imageSearching"]) && (
            <Stack spacing={2} alignItems="center">
              <CircularProgress />
              <Typography level="body-md">
                {state.value === "barcodeSearching"
                  ? "Searching by barcode..."
                  : "Analyzing image..."}
              </Typography>
            </Stack>
          )}
        </Stack>
      )}

      {state.value === "barcode" && (
        <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.md })}>
          <Card sx={{ padding: "1rem" }}>
            <Typography level="title-lg" textAlign="center">
              Scan barcode
            </Typography>
            <BarcodeScanner
              onChange={(barcode) => {
                send({ type: "FOUND", barcode });
                // Create form and submit for server action
                const form = document.createElement("form");
                form.style.display = "none";

                const barcodeInput = document.createElement("input");
                barcodeInput.name = "barcode";
                barcodeInput.value = JSON.stringify(barcode);

                form.appendChild(barcodeInput);
                document.body.appendChild(form);

                barcodeSearchAction(new FormData(form))
                  .then(() => {
                    document.body.removeChild(form);
                    send({ type: "SEARCH_COMPLETE" });
                  })
                  .catch(() => {
                    document.body.removeChild(form);
                    send({ type: "SEARCH_ERROR" });
                  });
              }}
            />
            <CardContent
              orientation="horizontal"
              sx={{ justifyContent: "flex-end" }}
            >
              <Button onClick={() => send({ type: "CANCEL" })}>Cancel</Button>
            </CardContent>
          </Card>
        </Box>
      )}

      {state.value === "image" && (
        <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.md })}>
          <Card sx={{ padding: "1rem" }}>
            <Typography level="title-lg" textAlign="center">
              Take a picture of the item
            </Typography>
            <CameraCapture
              onCapture={(image) => {
                send({ type: "CAPTURED", image });
                // Create form and submit for server action
                const form = document.createElement("form");
                form.style.display = "none";

                const imageInput = document.createElement("input");
                imageInput.name = "image";
                imageInput.value = image;

                form.appendChild(imageInput);
                document.body.appendChild(form);

                imageSearchAction(new FormData(form))
                  .then(() => {
                    document.body.removeChild(form);
                    send({ type: "SEARCH_COMPLETE" });
                  })
                  .catch(() => {
                    document.body.removeChild(form);
                    send({ type: "SEARCH_ERROR" });
                  });
              }}
            />
            <CardContent
              orientation="horizontal"
              sx={{ justifyContent: "space-between" }}
            >
              <Button onClick={() => send({ type: "CANCEL" })} color="neutral">
                Cancel
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
