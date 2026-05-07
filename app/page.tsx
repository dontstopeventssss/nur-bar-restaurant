"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

const buttonStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#111",
  color: "#fff",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const ownerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#fff",
  color: "#111",
};

export default function HomePage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f4f5",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          display: "grid",
          gap: 14,
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0, textAlign: "center" }}>NUR APP BAR</h1>
        <p style={{ margin: 0, textAlign: "center", color: "#666" }}>Seleziona area</p>

        <button onClick={() => router.push("/staff")} style={buttonStyle}>
          PER SALA
        </button>

        <button onClick={() => router.push("/bar")} style={buttonStyle}>
          NOTIFICHE BAR
        </button>

        <button onClick={() => router.push("/kitchen")} style={buttonStyle}>
          NOTIFICHE CUCINA
        </button>

        <button onClick={() => router.push("/owner")} style={ownerButtonStyle}>
          AREA OWNER
        </button>
      </div>
    </main>
  );
}
