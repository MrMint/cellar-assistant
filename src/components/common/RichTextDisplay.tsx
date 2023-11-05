import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { styled } from "@mui/joy";

export type RichTextDisplayProps = {
  text: string;
};

const StyledContentEditable = styled(ContentEditable)(({ theme }) => ({
  padding: "0 1rem",
  overflow: "hidden",
  maxHeight: "20rem",
  overflowY: "auto",
}));

export const RichTextDisplay = ({ text }: RichTextDisplayProps) => {
  return (
    <LexicalComposer
      initialConfig={
        {
          editable: false,
          editorState: text,
        } as InitialConfigType
      }
    >
      <RichTextPlugin
        contentEditable={<StyledContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
};
