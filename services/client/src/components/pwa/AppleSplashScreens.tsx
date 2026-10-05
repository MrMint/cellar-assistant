/**
 * Apple splash screen (startup image) link tags for iOS PWA.
 * Prevents white flash when launching the app from the home screen.
 * Each device size needs its own image matched by a media query.
 */

const splashScreens = [
  // iPhone 16 Pro Max (440x956 @3x)
  { w: 440, h: 956, r: 3, file: "1320x2868" },
  // iPhone 16 Pro (402x874 @3x)
  { w: 402, h: 874, r: 3, file: "1206x2622" },
  // iPhone 16 Plus, 15 Plus, 14 Pro Max (430x932 @3x)
  { w: 430, h: 932, r: 3, file: "1290x2796" },
  // iPhone 16, 15, 15 Pro, 14 Pro (393x852 @3x)
  { w: 393, h: 852, r: 3, file: "1179x2556" },
  // iPhone 14, 13, 12 (390x844 @3x)
  { w: 390, h: 844, r: 3, file: "1170x2532" },
  // iPhone 13 Pro Max, 12 Pro Max (428x926 @3x)
  { w: 428, h: 926, r: 3, file: "1284x2778" },
  // iPhone SE 3rd gen, 8 (375x667 @2x)
  { w: 375, h: 667, r: 2, file: "750x1334" },
  // iPhone 8 Plus (414x736 @3x)
  { w: 414, h: 736, r: 3, file: "1242x2208" },
  // iPad Pro 12.9" (1024x1366 @2x)
  { w: 1024, h: 1366, r: 2, file: "2048x2732", landscape: "2732x2048" },
  // iPad Pro 11" (834x1194 @2x)
  { w: 834, h: 1194, r: 2, file: "1668x2388", landscape: "2388x1668" },
  // iPad Air, iPad 10th gen (820x1180 @2x)
  { w: 820, h: 1180, r: 2, file: "1640x2360", landscape: "2360x1640" },
  // iPad Mini 6th gen (744x1133 @2x)
  { w: 744, h: 1133, r: 2, file: "1488x2266", landscape: "2266x1488" },
] as const;

export function AppleSplashScreens() {
  return (
    <>
      {splashScreens.map((s) => (
        <link
          key={s.file}
          rel="apple-touch-startup-image"
          href={`/splash/apple-splash-${s.file}.png`}
          media={`(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)`}
        />
      ))}
      {splashScreens
        .filter((s): s is typeof s & { landscape: string } => "landscape" in s)
        .map((s) => (
          <link
            key={`${s.landscape}-landscape`}
            rel="apple-touch-startup-image"
            href={`/splash/apple-splash-${s.landscape}.png`}
            media={`(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: landscape)`}
          />
        ))}
    </>
  );
}
