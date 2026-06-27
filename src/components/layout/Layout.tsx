import type { Page } from "../../types";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-stone-50">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
