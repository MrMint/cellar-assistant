import { DialogContent, DialogTitle, Modal, ModalDialog } from "@mui/joy";
import { CameraCapture } from "../common/CameraCapture";

export type AddPhotoProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
};

export const AddPhotoModal = ({ open, onClose, onCapture }: AddPhotoProps) => {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Set a new display image</DialogTitle>
        <DialogContent>
          <CameraCapture onCapture={onCapture} />
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
};
