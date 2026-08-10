import {
  ArrowLeftRight,
  ClipboardList,
  Coins,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  ShoppingCart,
  Tags,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import logo from "../../assets/logo.png";
import { authRequired, getCurrentUserEmail, signOut } from "../../lib/auth";
import { cn } from "../../lib/utils";
import type { Page } from "../../types";

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="size-4" aria-hidden />,
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: <Package className="size-4" aria-hidden />,
  },
  {
    id: "sales",
    label: "Sales",
    icon: <ShoppingCart className="size-4" aria-hidden />,
  },
  {
    id: "order",
    label: "Order",
    icon: <ReceiptText className="size-4" aria-hidden />,
  },
  {
    id: "history",
    label: "Order History",
    icon: <History className="size-4" aria-hidden />,
  },
  {
    id: "compare",
    label: "Compare",
    icon: <ArrowLeftRight className="size-4" aria-hidden />,
  },
  {
    id: "costs",
    label: "Costs",
    icon: <Coins className="size-4" aria-hidden />,
  },
  {
    id: "pricing",
    label: "Pricing",
    icon: <Tags className="size-4" aria-hidden />,
  },
  {
    id: "audit",
    label: "Audit Log",
    icon: <ClipboardList className="size-4" aria-hidden />,
  },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  /** Provided in the mobile drawer to render a close button. */
  onClose?: () => void;
}

export function Sidebar({ activePage, onNavigate, onClose }: SidebarProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) void getCurrentUserEmail().then(setUserEmail);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.reload();
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-stone-200 bg-white px-3 py-5 lg:w-56">
      {onClose !== undefined && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="mb-1 self-end rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 lg:hidden"
        >
          <X className="size-5" aria-hidden />
        </button>
      )}
      <div className="mb-6 flex flex-col items-center px-2">
        <img src={logo} alt="DECANTVERSE" className="h-20 w-auto object-contain" />
        <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-stone-400">
          Inventory Manager
        </p>
      </div>

      <nav aria-label="Main navigation">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-amber-50 text-amber-800"
                      : "text-stone-600 hover:bg-stone-50 hover:text-stone-900",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={cn(
                      isActive ? "text-amber-700" : "text-stone-400",
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto space-y-2 px-3">
        {authRequired && userEmail !== null && (
          <div className="border-t border-stone-100 pt-3">
            <p className="truncate text-xs text-stone-500" title={userEmail}>
              {userEmail}
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-1 flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-amber-700"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        )}
        <p className="text-xs text-stone-400">DECANTVERSE © 2026</p>
      </div>
    </aside>
  );
}
