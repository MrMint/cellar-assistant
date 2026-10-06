"use client";

import { useEffect, useId, useState } from "react";

interface Bubble {
  id: number;
  x: number;
  size: number;
  delay: number;
  duration: number;
  startBottom: number;
}

export function LiquidBackground() {
  const uid = useId();
  const id = uid.replace(/:/g, "");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setBubbles(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: 5 + Math.random() * 90,
        size: 4 + Math.random() * 16,
        delay: Math.random() * 6,
        duration: 3 + Math.random() * 6,
        startBottom: -5 + Math.random() * 60,
      })),
    );
  }, []);

  const anim = !prefersReducedMotion;

  return (
    <>
      <style>{`
        @keyframes lbFill-${id} {
          0%       { height: 5%; }
          85%, 100% { height: 75%; }
        }
        @keyframes lbFoam-${id} {
          0%        { top: -40px; height: 40px; opacity: 0.6; }
          65%, 100% { top: -160px; height: 160px; opacity: 1; }
        }
        @keyframes lbWave-${id} {
          0%   { transform: skewY(0deg); }
          8%   { transform: skewY(-2deg); }
          16%  { transform: skewY(2deg); }
          24%  { transform: skewY(-1.5deg); }
          32%  { transform: skewY(1.5deg); }
          40%  { transform: skewY(-1deg); }
          50%  { transform: skewY(0.8deg); }
          60%  { transform: skewY(-0.4deg); }
          72%  { transform: skewY(0.15deg); }
          85%  { transform: skewY(-0.05deg); }
          100% { transform: skewY(0deg); }
        }
@keyframes lbRise-${id} {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          8%   { opacity: 0.6; }
          85%  { opacity: 0.2; }
          100% { transform: translateY(-35vh) scale(0.5); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lb-${id} { animation: none !important; }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {/* Pour stream — hidden for now */}

        {/* Liquid body — bottom: -30px to prevent gap from wobble */}
        <div
          className={`lb-${id}`}
          style={{
            position: "absolute",
            zIndex: 1,
            bottom: -30,
            left: -4,
            right: -4,
            height: anim ? "5%" : "75%",
            background:
              "linear-gradient(to bottom, rgba(255,206,84,0.7), rgba(220,170,50,0.75) 40%, rgba(180,120,20,0.8))",
            transformOrigin: "center bottom",
            animation: anim
              ? `lbFill-${id} 6s ease forwards, lbWave-${id} 6s ease-out forwards`
              : undefined,
          }}
        >
          {/* Foam head — starts with 30px, grows to 100px */}
          <div
            className={`lb-${id}`}
            style={{
              position: "absolute",
              left: -4,
              right: -4,
              top: anim ? -40 : -160,
              height: anim ? 40 : 160,
              opacity: anim ? 0.6 : 1,
              background: "rgba(255, 255, 255, 0.75)",
              borderRadius: "12px 12px 0 0",
              animation: anim ? `lbFoam-${id} 6s ease forwards` : undefined,
            }}
          />

          {/* Bubbles */}
          {bubbles.map((b) => (
            <div
              key={b.id}
              className={`lb-${id}`}
              style={{
                position: "absolute",
                bottom: `${b.startBottom}%`,
                left: `${b.x}%`,
                width: b.size,
                height: b.size,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.6), rgba(255,230,160,0.2))",
                animation: anim
                  ? `lbRise-${id} ${b.duration}s ease-out ${b.delay}s infinite`
                  : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
