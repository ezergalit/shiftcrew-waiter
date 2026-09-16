import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { applyTheme } from "./lib/theme";

// Every Tailwind hex class is mapped onto a restaurant colour token (theme.css), and MainApp
// only sets those tokens after login — so until then they were undefined and the join screen
// rendered with no card, field or button backgrounds (16.9). Stock tokens go on first;
// MainApp replaces them with the restaurant's own the moment a session exists.
applyTheme(null);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
