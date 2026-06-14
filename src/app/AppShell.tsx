import type { CSSProperties, ReactNode } from "react";

export type AppShellProps = {
  children: ReactNode;
  floatingPanels: boolean;
  leftCollapsed: boolean;
  onCloseFloatingPanels: () => void;
  panelsSwapped: boolean;
  resizingPanel: string | null;
  rightCollapsed: boolean;
  shellStyle: CSSProperties;
};

export function AppShell({
  children,
  floatingPanels,
  leftCollapsed,
  onCloseFloatingPanels,
  panelsSwapped,
  resizingPanel,
  rightCollapsed,
  shellStyle,
}: AppShellProps) {
  return (
    <main
      className={`studio-shell ${leftCollapsed ? "left-hidden" : ""} ${rightCollapsed ? "right-hidden" : ""} ${panelsSwapped ? "panels-swapped" : ""} ${floatingPanels ? "floating-panels" : ""} ${resizingPanel ? "resizing-panels" : ""}`}
      style={shellStyle}
    >
      {floatingPanels && (!leftCollapsed || !rightCollapsed) && (
        <button
          aria-label="Fechar painel lateral"
          className="floating-panel-backdrop"
          onClick={onCloseFloatingPanels}
          type="button"
        />
      )}
      {children}
    </main>
  );
}
