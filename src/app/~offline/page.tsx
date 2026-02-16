"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: "#111015",
        color: "#e0e0e0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100vw",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.6 }}>
          &#x1F4F6;
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginBottom: 12,
            color: "#ffffff",
          }}
        >
          You&apos;re offline
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.5,
            color: "#a0a0a0",
            marginBottom: 24,
          }}
        >
          It looks like you&apos;ve lost your internet connection. Check your
          connection and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            backgroundColor: "#70a3a9",
            color: "#111015",
            border: "none",
            borderRadius: 8,
            padding: "12px 24px",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
