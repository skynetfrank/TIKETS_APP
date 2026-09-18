import { useState, useEffect, useRef } from "react";
import { Link, Outlet } from "react-router";

function App() {
  return (
    <>
      <div className="grid-container">
        <header>
          <div></div>
        </header>
        <main>
          <Outlet />
        </main>
        <footer>

        </footer>
      </div>
      {/* El modal se renderiza aquí para estar disponible en toda la app */}
    </>
  );
}

export default App;
