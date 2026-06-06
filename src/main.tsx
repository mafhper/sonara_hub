import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import BenchmarkDashboard from "./BenchmarkDashboard";
import "./styles.css";

const page =
  window.location.pathname.replace(/\/+$/u, "") === "/benchmarks" ? (
    <BenchmarkDashboard />
  ) : (
    <App />
  );

createRoot(document.getElementById("root")!).render(
  <StrictMode>{page}</StrictMode>,
);
