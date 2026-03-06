import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import Dashboard from "./pages/Dashboard";
import FaultTreeEditor from "./pages/FaultTreeEditor";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { AuthProvider, useAuth } from "./store/useAuthStore";
import "./App.css";

const antTheme = {
  token: {
    colorPrimary: "#1677ff",
    borderRadius: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
  },
};

// ─── 路由守卫：未登录自动跳转到 /login ──────────────────────────
function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

// ─── 已登录时访问登录/注册页面，自动跳转到 /dashboard ───────────
function GuestOnly({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ConfigProvider theme={antTheme} locale={zhCN}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/login"
                element={<GuestOnly><Login /></GuestOnly>}
              />
              <Route
                path="/register"
                element={<GuestOnly><Register /></GuestOnly>}
              />
              <Route
                path="/dashboard"
                element={<RequireAuth><Dashboard /></RequireAuth>}
              />
              <Route
                path="/editor"
                element={<RequireAuth><FaultTreeEditor /></RequireAuth>}
              />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}