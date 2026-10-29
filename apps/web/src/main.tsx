import "@sorte/ui/fonts";
import "@sorte/ui/tokens.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./App";
import { Docs } from "./pages/Docs";
import { Download } from "./pages/Download";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { SettingsPreview } from "./pages/SettingsPreview";
import { Sorting } from "./pages/Sorting";
import { Technology } from "./pages/Technology";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/sorting", element: <Sorting /> },
      { path: "/technology", element: <Technology /> },
      { path: "/download", element: <Download /> },
      { path: "/docs", element: <Docs /> },
      { path: "/settings", element: <SettingsPreview /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
