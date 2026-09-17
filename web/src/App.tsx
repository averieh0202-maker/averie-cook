import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { CookedPage } from "./pages/CookedPage";
import { WantCookPage } from "./pages/WantCookPage";
import { WantEatPage } from "./pages/WantEatPage";

const DishPage = lazy(() => import("./pages/DishPage").then((m) => ({ default: m.DishPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

function RouteFallback() {
  return (
    <div className="animate-pulse overflow-hidden rounded-[1.7rem] bg-card">
      <div className="aspect-square bg-chip" />
      <div className="space-y-2 p-4">
        <div className="h-6 w-48 rounded bg-chip" />
        <div className="h-4 w-32 rounded bg-chip" />
      </div>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CookedPage />} />
            <Route path="/want-cook" element={<WantCookPage />} />
            <Route path="/want-eat" element={<WantEatPage />} />
            <Route
              path="/dishes/:id"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DishPage />
                </Suspense>
              }
            />
            <Route
              path="/login"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <LoginPage />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
