import React from "react";
import ReactDOM from "react-dom/client";
import RestaurantDemo from "./RestaurantDemo";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RestaurantDemo />
    </ErrorBoundary>
  </React.StrictMode>
);
