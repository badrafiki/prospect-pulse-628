import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Search,
  Building2,
  Users,
  Download,
  Settings,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  Globe,
  FolderDown,
} from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/search", icon: Search, label: "Discover" },
  { to: "/lookup", icon: Globe, label: "Quick Lookup" },
  { to: "/companies", icon: Building2, label: "Companies" },
  { to: "/people", icon: Users, label: "People" },
  { to: "/export", icon: Download, label: "Export" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { isAdmin } = useAdmin();

  const allNavItems = [
    ...navItems,
    ...(isAdmin ? [{ to: "/admin", icon: ShieldCheck, label: "Admin" }] : []),
  ];

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-[220px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {/* Logo */}
          <div className="flex h-14 items-center gap-2.5 px-5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Search className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-sidebar-accent-foreground">
              LeadScope
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 px-3 pt-2">
            {allNavItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground"
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12px] font-medium text-sidebar-accent-foreground">
                  {user?.email?.split("@")[0]}
                </p>
                <p className="truncate text-[11px] text-sidebar-foreground">
                  {user?.email}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
                    onClick={signOut}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
