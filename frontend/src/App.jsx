import { useState } from "react";

import Jeu from "@pages/Jeu";
import Home from "@pages/Home";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// import GlobeTest from "@pages/GlobeTest";

import "./App.css";
import UseDecrement from "@components/Countdown";

function App() {
  const [playerName, setPlayerName] = useState("");

  return (
    <Router>
      <div className="App">
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
          <Route path="/countdown" element={<UseDecrement />} />
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
