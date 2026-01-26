import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { Sheet, styled } from "@mui/joy";
import type { EditorState } from "lexical";
import { not } from "ramda";

export type RichTextEditorProps = {
  initialText?: string;
  value?: string;
  placeholder?: string;
  readonly?: boolean;
  onChange: (editorState: string) => void;
};

const StyledContentEditable = styled(ContentEditable)(({ theme }) => ({
  padding: "0 1rem",
  overflow: "hidden",
  maxHeight: "20rem",
  overflowY: "auto",
  borderRadius: theme.radius.sm,
  ":focus": theme.focus.default,
}));

const StyledSheet = styled(Sheet)(({ theme }) => ({
  borderRadius: theme.radius.sm,
}));

const StyledPlaceholder = styled("div")(() => ({
  position: "absolute",
  top: "15px",
  left: "1rem",
  userSelect: "none",
  pointerEvents: "none",
}));

export const RichTextEditor = ({
  initialText,
  value,
  onChange,
  readonly = false,
  placeholder = "Enter some text...",
}: RichTextEditorProps) => {
  const handleChange = (editorState: EditorState) => {
    onChange(JSON.stringify(editorState));
  };

  // Use value as alias for initialText if provided
  const editorInitialState = value ?? initialText;

  return (
    <LexicalComposer
      initialConfig={
        {
          editable: not(readonly),
          editorState: editorInitialState,
        } as InitialConfigType
      }
    >
      <StyledSheet variant="outlined">
        <RichTextPlugin
          contentEditable={<StyledContentEditable />}
          placeholder={<StyledPlaceholder>{placeholder}</StyledPlaceholder>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <OnChangePlugin onChange={handleChange} />
      </StyledSheet>
    </LexicalComposer>
  );
};
