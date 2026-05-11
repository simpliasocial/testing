import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DashboardDataProvider } from "@/context/DashboardDataContext";

const Login = lazy(() => import("@/pages/Login"));
const DashboardLayout = lazy(() => import("@/components/DashboardLayout"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const RouteFallback = () => (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando...
    </div>
);

export const AppRouter = () => (
    <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <DashboardDataProvider>
                                <DashboardLayout />
                            </DashboardDataProvider>
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Suspense>
    </BrowserRouter>
);
