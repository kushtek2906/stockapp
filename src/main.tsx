import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App.tsx";
import { PasscodeGate } from "./components/auth/PasscodeGate";

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <PasscodeGate>
      <App />
    </PasscodeGate>
    <Toaster position="top-center" richColors closeButton />
  </StrictMode>,
);
