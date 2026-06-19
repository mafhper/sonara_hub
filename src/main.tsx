import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./theme.css";

const BenchmarkDashboard = lazy(() => import("./BenchmarkDashboard"));

const page =
  window.location.pathname.replace(/\/+$/u, "") === "/benchmarks" ? (
    <Suspense
      fallback={
        <main aria-busy="true" className="bench-dashboard">
          <div className="bench-empty" role="status">
            Carregando Benchmark Center…
          </div>
        </main>
      }
    >
      <BenchmarkDashboard />
    </Suspense>
  ) : (
    <App />
  );

createRoot(document.getElementById("root")!).render(
  <StrictMode>{page}</StrictMode>,
);
