import "@sorte/ui/fonts";
import "@sorte/ui/tokens.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./App";
import { Docs } from "./pages/Docs";
import { Download } from "./pages/Download";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/download", element: <Download /> },
      { path: "/docs", element: <Docs /> },
      // Older addresses keep working.
      { path: "/sorting", element: <Navigate to="/#streams" replace /> },
      { path: "/technology", element: <Navigate to="/" replace /> },
      { path: "/settings", element: <Navigate to="/docs" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
