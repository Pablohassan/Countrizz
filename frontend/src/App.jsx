import { useState } from "react";

import Jeu from "@pages/Jeu";
import Home from "@pages/Home";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

// import GlobeTest from "@pages/GlobeTest";

import "./App.css";

function App() {
  const [playerName, setPlayerName] = useState("");

  return (
    <Router>
      <div className="App">
        <nav>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
          </ul>
        </nav>
        <Routes>
          <Route
            path="/"
            element={
              <Home
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
              />
            }
          />
          <Route
            path="/jeu"
            element={
              <Jeu playerName={playerName} onPlayerNameChange={setPlayerName} />
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
