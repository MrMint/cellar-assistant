import {
  Box,
  Button,
  Card,
  CardContent,
  CardCover,
  CardOverflow,
  CircularProgress,
  Grid,
  IconButton,
  Input,
  Skeleton,
  Stack,
  Typography,
} from "@mui/joy";
import { useActor } from "@xstate/react";
import { includes, isEmpty, not } from "ramda";
import { MdCamera, MdScanner, MdSearch } from "react-icons/md";
import { useClient } from "urql";
import { formatItemType } from "@/utilities";
import { BarcodeScanner } from "../common/BarcodeScanner";
import { CameraCapture } from "../common/CameraCapture";
import { ItemCard } from "../item/ItemCard";
import { searchItemsMachine } from "./actors/searchItems";

export const ItemSearch = () => {
  const urqlClient = useClient();

  const [state, send] = useActor(searchItemsMachine, {
    input: {
      urqlClient,
    },
  });

  return (
    <Box>
      {includes(state.value, [
        "idle",
        "debouncing",
        "barcodeSearching",
        "imageSearching",
        "textSearching",
      ]) && (
        <Stack spacing={2}>
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }}>
            <Input
              autoFocus
              startDecorator={
                state.value === "textSearching" ? (
                  <CircularProgress size="sm" />
                ) : (
                  <MdSearch />
                )
              }
              placeholder="Search"
              value={state.context.text}
              disabled={includes(state.value, [
                "imageSearching",
                "barcodeSearching",
              ])}
              onChange={(event) =>
                send({ type: "SEARCH", text: event.target.value })
              }
            />
            <Stack direction="row" spacing={2} minWidth="280px">
              <Button
                variant="outlined"
                fullWidth
                color="neutral"
                onClick={() => send({ type: "SEARCH_BARCODE" })}
              >
                Scan Barcode
              </Button>
              <Button
                variant="outlined"
                fullWidth
                color="neutral"
                onClick={() => send({ type: "SEARCH_IMAGE" })}
              >
                Take Picture
              </Button>
            </Stack>
          </Stack>
          <Grid container spacing={2}>
            {includes(state.value, [
              "textSearching",
              "imageSearching",
              "barcodeSearching",
            ]) &&
              isEmpty(state.context.items) &&
              [1, 2, 3, 4, 5, 6].map((x) => (
                <Grid
                  key={x}
                  sx={{ overflow: "hidden" }}
                  xs={12}
                  sm={6}
                  md={4}
                  lg={2}
                >
                  <Card sx={{ aspectRatio: { xs: 1.2, sm: 1 } }}>
                    <CardCover>
                      <Skeleton />
                    </CardCover>
                  </Card>
                </Grid>
              ))}
            {state.context.items.map((x) => (
              <Grid
                key={x.id}
                xs={state.context.items.length > 6 ? 6 : 12}
                sm={6}
                md={4}
                lg={2}
              >
                <ItemCard
                  key={x.id}
                  item={x}
                  type={x.type}
                  href={`${formatItemType(x.type).toLowerCase()}s/${x.id}`}
                />
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}
      {state.value === "barcode" && (
        <Grid xs={12} sm={12} md={6}>
          <Card sx={{ padding: "1rem" }}>
            <Typography level="title-lg" textAlign="center">
              Scan barcode
            </Typography>
            <BarcodeScanner
              onChange={(barcode) => send({ type: "FOUND", barcode })}
            />
            <CardContent
              orientation="horizontal"
              sx={{ justifyContent: "flex-end" }}
            >
              <Button onClick={() => send({ type: "CANCEL" })}>Cancel</Button>
            </CardContent>
          </Card>
        </Grid>
      )}
      {state.value === "image" && (
        <Grid xs={12} sm={12} md={6}>
          <Card sx={{ padding: "1rem" }}>
            <Typography level="h4" textAlign="center">
              Take a picture of the item
            </Typography>
            <CameraCapture
              onCapture={(image) => send({ type: "CAPTURED", image })}
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
        </Grid>
      )}
    </Box>
  );
};
