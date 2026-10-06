/**
 * `next/image` for render tests: the **real** component for remote URLs, a
 * stub for bundled art.
 *
 * Why split: bun imports a `.png` as a filesystem path string, not the
 * static-image object Next's loader produces, so the real component cannot
 * render bundled art here (no width, no blur data). A remote `http(s)://`
 * URL — a presigned item photo, an avatar — renders exactly as it does in
 * the app, which is the point: the test then sees the `/_next/image?url=…&w=…`
 * markup the optimizer will be asked for.
 *
 * The real component takes its config from `ImageConfigContext` when the
 * build's `__NEXT_IMAGE_OPTS` define is absent (it is, under bun), so
 * {@link NextImageConfig} provides `next.config.mjs`'s own `imagesConfig()` —
 * sizes and widths asserted against the configuration that ships, not a copy.
 *
 * Use: `mock.module("next/image", () => nextImageModule("art"))` before
 * importing the component, and wrap renders in `<NextImageConfig>`.
 */
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import RealImage from "next/dist/shared/lib/image-external";
import type { ComponentProps, ReactNode } from "react";
import { imagesConfig } from "../../next.config.mjs";

type ImageProps = ComponentProps<typeof RealImage>;

const isRemote = (src: ImageProps["src"]): src is string =>
  typeof src === "string" && /^https?:\/\//.test(src);

/** A `next/image` module whose default export is described above. */
export const nextImageModule = (stubLabel: string) => ({
  default: (props: ImageProps) =>
    isRemote(props.src) ? (
      <RealImage {...props} />
    ) : (
      <span data-next-image={stubLabel} data-alt={props.alt} />
    ),
});

export const NextImageConfig = ({ children }: { children: ReactNode }) => (
  <ImageConfigContext.Provider
    value={{
      ...imageConfigDefault,
      ...(imagesConfig() as Partial<typeof imageConfigDefault>),
    }}
  >
    {children}
  </ImageConfigContext.Provider>
);

/** The `/_next/image` request the optimizer gets for `src` at width `w`. */
export const optimizedSrc = (src: string, w: number, q = 75): string =>
  `/_next/image?url=${encodeURIComponent(src)}&amp;w=${w}&amp;q=${q}`;
