import {
  Button,
  Card,
  CardContent,
  CardCover,
  CircularProgress,
  IconButton,
} from "@mui/joy";
import { isNil } from "ramda";
import { useCallback, useEffect, useRef, useState } from "react";
import { BsCamera } from "react-icons/bs";
import Webcam from "react-webcam";

const videoConstraints = {
  width: 1080,
  height: 1920,
  facingMode: "environment",
};

export const CameraCapture = ({
  onCapture,
}: {
  onCapture: (image: string) => void;
}) => {
  const webcamRef = useRef<Webcam | null>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const capture = useCallback(() => {
    if (webcamRef.current !== null) {
      const result = webcamRef.current.getScreenshot();
      if (result != null) {
        onCapture(result);
      }
    }
  }, [webcamRef, onCapture]);
  return (
    <Card sx={{ aspectRatio: "10/16", maxHeight: "600px" }}>
      {!isVideoLoaded && (
        <CardCover>
          <CircularProgress />
        </CardCover>
      )}
      <CardCover>
        <Webcam
          ref={webcamRef}
          audio={false}
          forceScreenshotSourceSize={true}
          screenshotQuality={1}
          screenshotFormat="image/png"
          videoConstraints={videoConstraints}
          onUserMedia={() => setIsVideoLoaded(true)}
        />
      </CardCover>
      <CardContent sx={{ justifyContent: "flex-end", alignItems: "center" }}>
        <IconButton onClick={capture} size="lg" variant="solid" color="primary">
          <BsCamera />
        </IconButton>
      </CardContent>
    </Card>
  );
};
