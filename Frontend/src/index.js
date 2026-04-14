/*!

=========================================================
* Argon Dashboard React - v1.2.4
=========================================================

* Product Page: https://www.creative-tim.com/product/argon-dashboard-react
* Copyright 2024 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/argon-dashboard-react/blob/master/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import "assets/plugins/nucleo/css/nucleo.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "assets/scss/argon-dashboard-react.scss";
import "assets/css/fonts.css";

import AdminLayout from "layouts/Admin.js";
import AuthLayout from "layouts/Auth.js";
import ProtectedRoute from "components/ProtectedRoute";

// Custom styles for toast container
const toastStyles = `
  .Toastify__toast-container--top-center {
    top: 1em;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 500px;
    padding: 0 1em;
  }
  .Toastify__toast {
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 8px;
    min-height: 64px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .Toastify__toast-body {
    margin: auto 0;
    flex: 1;
    text-align: center;
  }
  .Toastify__close-button {
    align-self: center;
  }
`;

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <BrowserRouter>
    <style>{toastStyles}</style>
    <ToastContainer
      position="top-center"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
    />
    <Routes>
      <Route path="/" element={<Navigate to="/auth/login" replace />} />
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        } 
      />
      <Route path="/auth/*" element={<AuthLayout />} />
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  </BrowserRouter>
);
