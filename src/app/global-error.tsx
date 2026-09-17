"use client";

// Catches an error in the root layout itself, where the normal error.tsx boundary can't help
// (it's inside the layout it would need to replace). Per the installed Next version's own docs,
// global-error must render its own <html>/<body> and does NOT receive the app's global
// stylesheet, so this stays plain inline-styled HTML rather than Tailwind classes that would
// silently not apply here.
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#4b5563", marginBottom: "1rem" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              borderRadius: "6px",
              backgroundColor: "#2563eb",
              color: "white",
              padding: "8px 12px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
