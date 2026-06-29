import { Menu } from "lucide-react";
import { useState } from "react";
import logo from "../../assets/logo.png";
import type { Page } from "../../types";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // On mobile, selecting a nav item also closes the drawer.
  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Backdrop (mobile only, when drawer open) */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar: off-canvas drawer on mobile, static on desktop */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <Sidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          onClose={() => setMobileNavOpen(false)}
        />
      </div>

      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-2.5 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <img src={logo} alt="DECANTVERSE" className="h-7 w-auto object-contain" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
