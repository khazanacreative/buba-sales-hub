import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./lib/auth";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Penjualan from "./pages/Penjualan";
import Produksi from "./pages/Produksi";
import Laporan from "./pages/Laporan";
import Keuangan from "./pages/Keuangan";
import MasterData from "./pages/MasterData";
import StokGudang from "./pages/StokGudang";
import Absensi from "./pages/Absensi";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/welcome" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/penjualan" element={<Penjualan />} />
                <Route path="/stok" element={<StokGudang />} />
                <Route path="/absensi" element={<Absensi />} />
                <Route path="/laporan" element={<Laporan />} />
                <Route element={<ProtectedRoute adminOnly />}>
                  <Route path="/produksi" element={<Produksi />} />
                  <Route path="/keuangan" element={<Keuangan />} />
                  <Route path="/master" element={<MasterData />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
