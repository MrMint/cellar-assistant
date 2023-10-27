import { Barcode, BarcodeType } from "@/constants";
import {
  Button,
  Card,
  CardContent,
  CardCover,
  CircularProgress,
  Typography,
  styled,
} from "@mui/joy";
import { useEffect, useState } from "react";
import { Result, useZxing } from "react-zxing";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const hints = new Map<DecodeHintType, any>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A],
  ],
]);

const StyledVideo = styled("video")(() => ({
  objectFit: "scale-down",
}));

type BarcodeScannerProps = {
  onChange: (result: Barcode) => void;
};

export const BarcodeScanner = ({ onChange }: BarcodeScannerProps) => {
  const [result, setResult] = useState<Result>();
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const {
    ref,
    torch: { off, on, status },
  } = useZxing({
    onDecodeResult(result) {
      setResult(result);
    },
    constraints: {
      video: {
        width: 1920,
        height: 1080,
        facingMode: "environment",
      },
    },
    hints,
  });

  useEffect(() => {
    if (result !== undefined) {
      let type: BarcodeType | undefined;
      switch (result.getBarcodeFormat()) {
        case BarcodeFormat.UPC_A:
          type = BarcodeType.UPC_A;
          break;
        case BarcodeFormat.EAN_13:
          type = BarcodeType.EAN_13;
          break;
        default:
          break;
      }
      onChange({
        text: result.getText(),
        type: type,
      });
    }
  }, [result, onChange]);

  return (
    <Card sx={{ aspectRatio: "16/10" }}>
      {!isVideoLoaded && (
        <CardCover>
          <CircularProgress />
        </CardCover>
      )}
      <CardCover>
        <StyledVideo
          ref={ref}
          placeholder=""
          onLoadedData={() => setIsVideoLoaded(true)}
        />
      </CardCover>
      {isVideoLoaded && (
        <CardContent>
          {status !== "unavailable" && (
            <Button
              onClick={() => {
                status === "on" ? off() : on();
              }}
            >
              Toggle light
            </Button>
          )}
          <Typography level="body-lg" fontWeight="lg">
            Scanning...
          </Typography>
        </CardContent>
      )}
    </Card>
  );
};
