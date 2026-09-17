import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { CookedPage } from "./pages/CookedPage";
import { DishPage } from "./pages/DishPage";
import { LoginPage } from "./pages/LoginPage";
import { WantCookPage } from "./pages/WantCookPage";
import { WantEatPage } from "./pages/WantEatPage";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CookedPage />} />
            <Route path="/want-cook" element={<WantCookPage />} />
            <Route path="/want-eat" element={<WantEatPage />} />
            <Route path="/dishes/:id" element={<DishPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
