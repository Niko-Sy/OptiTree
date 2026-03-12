import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App as AntApp, ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import Dashboard from "./pages/Dashboard";
import FaultTreeEditor from "./pages/FaultTreeEditor";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { AuthProvider, useAuth } from "./store/useAuthStore";
import { NotificationProvider } from "./store/useNotificationStore";
import "./App.css";

// ─── 懒加载新页面 ──────────────────────────────────────────────────
const KnowledgeGraphEditor = lazy(() => import('./pages/KnowledgeGraphEditor'))
const Collaboration = lazy(() => import('./pages/Collaboration'))
const Profile = lazy(() => import('./pages/Profile'))
const Team = lazy(() => import('./pages/Team'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Help = lazy(() => import('./pages/Help'))

function PageLoading() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <Spin size="large" tip="加载中..." />
    </div>
  )
}

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
        <NotificationProvider>
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
              <Route
                path="/knowledge"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageLoading />}>
                      <KnowledgeGraphEditor />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/collaboration"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageLoading />}>
                      <Collaboration />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageLoading />}>
                      <Profile />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/team"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageLoading />}>
                      <Team />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageLoading />}>
                      <Notifications />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="/help"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageLoading />}>
                      <Help />
                    </Suspense>
                  </RequireAuth>
                }
              />
            </Routes>
            </BrowserRouter>
          </AuthProvider>
        </NotificationProvider>
      </AntApp>
    </ConfigProvider>
  );
}