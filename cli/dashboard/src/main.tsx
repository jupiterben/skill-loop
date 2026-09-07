import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AntdProvider } from "./AntdProvider";
import { App } from "./App";
import { AppErrorBoundary } from "./components/ErrorAlert";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AntdProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </AntdProvider>
  </StrictMode>
);
