import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SearchProvider } from "@/contexts/SearchContext";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import SearchPage from "@/pages/SearchPage";
import CompaniesPage from "@/pages/CompaniesPage";
import CompanyDetailPage from "@/pages/CompanyDetailPage";
import PeoplePage from "@/pages/PeoplePage";
import ExportPage from "@/pages/ExportPage";
import QuickLookupPage from "@/pages/QuickLookupPage";
import SettingsPage from "@/pages/SettingsPage";
import AdminPage from "@/pages/AdminPage";
import DirectoryImportPage from "@/pages/DirectoryImportPage";
import NotFound from "@/pages/NotFound";
import { useAdmin } from "@/hooks/useAdmin";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute() {
  const { user, loading } = useAuth();
  const { isAdmin, isAdminLoading } = useAdmin();
  if (loading || isAdminLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <AppLayout><AdminPage /></AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SearchProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
              <Route path="/companies" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
              <Route path="/companies/:id" element={<ProtectedRoute><CompanyDetailPage /></ProtectedRoute>} />
              <Route path="/people" element={<ProtectedRoute><PeoplePage /></ProtectedRoute>} />
              <Route path="/lookup" element={<ProtectedRoute><QuickLookupPage /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SearchProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
