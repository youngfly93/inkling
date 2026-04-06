import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import SettingsPage from "./pages/Settings";
import LibraryPage from "./pages/Library";
import ActionBar from "./pages/ActionBar";
import ResultPage from "./pages/Result";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/actionbar" element={<ActionBar />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="*" element={<div />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
