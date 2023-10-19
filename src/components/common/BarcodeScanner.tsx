import { Barcode, BarcodeType } from "@/constants";
import {
  AspectRatio,
  Card,
  CardContent,
  CardCover,
  CardOverflow,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
  styled,
} from "@mui/joy";
import { useEffect, useState } from "react";
import { Result, useZxing } from "react-zxing";
import { BarcodeFormat } from "@zxing/library";

const StyledVideo = styled("video")(() => ({
  objectFit: "scale-down",
}));

export type BarcodeScanResult = {
  success: boolean;
  barcode: Barcode;
};

type BarcodeScannerProps = {
  onChange: (result: BarcodeScanResult) => void;
};

const BarcodeScanner = ({ onChange }: BarcodeScannerProps) => {
  const [result, setResult] = useState<Result>();
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const { ref } = useZxing({
    onDecodeResult(result) {
      setResult(result);
    },
  });

  useEffect(() => {
    if (result !== undefined) {
      let type: BarcodeType | undefined;
      switch (result.getBarcodeFormat()) {
        case BarcodeFormat.UPC_A:
          type = BarcodeType.UPC_12;
          break;
        case BarcodeFormat.EAN_13:
          type = BarcodeType.EAN_13;
          break;
        default:
          break;
      }
      onChange({
        success: type !== undefined,
        barcode: {
          text: result.getText(),
          type: type ?? BarcodeType.EAN_13,
        },
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
          <Typography level="body-lg" fontWeight="lg">
            Scanning...
          </Typography>
        </CardContent>
      )}
    </Card>
  );
};

export default BarcodeScanner;
