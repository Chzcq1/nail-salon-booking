import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// In production (Vercel), VITE_API_URL points to the Render backend.
// In development, it's empty so relative /api paths proxy via Vite.
const API_BASE = import.meta.env.VITE_API_URL ?? "";
if (API_BASE) {
  const _orig = window.fetch.bind(window);
  window.fetch = (input, init?) => {
    if (typeof input === "string" && input.startsWith("/")) {
      input = API_BASE + input;
    }
    return _orig(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
