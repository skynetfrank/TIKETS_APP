import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from "react-router";
import "./index.css";
import App from "./App";

const router = createBrowserRouter(createRoutesFromElements(<Route path="/" element={<App />}></Route>));

ReactDOM.createRoot(document.getElementById("root")).render(
  //<Provider store={store}>
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
  // </Provider>,
);
