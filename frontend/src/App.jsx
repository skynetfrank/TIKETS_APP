import { useState, useEffect, useRef } from "react";
import { Link, Outlet } from "react-router";

function App() {
  return (
    <>
      <div className="grid-container">
        <header className="app-header">
          <div className="header-actions"></div>
        </header>
        <main>
          <Outlet />
        </main>
        <footer>
          <div className="footer-content">
            <div className="social-icons"></div>
          </div>
        </footer>
      </div>
      {/* El modal se renderiza aquí para estar disponible en toda la app */}
    </>
  );
}

export default App;
