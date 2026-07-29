import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./layouts/RootLayout";
import RouteError from "./layouts/RouteError";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import WorkspaceLayout from "./pages/workspace/WorkspaceLayout";
import PageEditor from "./pages/workspace/PageEditor";
import DatabaseView from "./pages/workspace/DatabaseView";
import SearchPage from "./pages/workspace/SearchPage";
import TrashPage from "./pages/workspace/TrashPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteError,
    children: [
      // Public
      { path: "login", Component: Login },
      { path: "signup", Component: Signup },

      // Protected
      {
        Component: RequireAuth,
        children: [
          { path: "workspace", Component: WorkspaceLayout, children: [
            { index: true, element: <Navigate to="/" replace /> },
            { path: "page/:pageId", Component: PageEditor },
            { path: "database/:pageId", Component: DatabaseView },
            { path: "search", Component: SearchPage },
            { path: "trash", Component: TrashPage },
          ]},
          { index: true, element: <Navigate to="/workspace" replace /> },
        ],
      },

      { path: "*", Component: NotFound },
    ],
  },
]);
