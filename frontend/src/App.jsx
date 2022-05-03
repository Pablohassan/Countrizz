import { useState } from "react";
import ModeJeu from "@pages/Modejeu";
import Jeu from "@pages/Jeu";
import JeuPays from "@pages/JeuPays";
import JeuCity from "@pages/JeuCity";
import Home from "@pages/Home";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import "./App.css";

import UseDecrement from "@components/Countdown";
import UseDecrementPays from "@components/CountdownPays";
import UseDecrementCity from "@components/ContdownCity";

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
          <Route path="/modejeu" element={<ModeJeu />} />

          <Route path="/countdown" element={<UseDecrement />} />
          <Route path="/countdownPays" element={<UseDecrementPays />} />
          <Route path="/countdownCity" element={<UseDecrementCity />} />

          <Route
            path="/jeu"
            element={
              <Jeu playerName={playerName} onPlayerNameChange={setPlayerName} />
            }
          />

          <Route
            path="/jeuPays"
            element={
              <JeuPays
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
              />
            }
          />
          <Route
            path="/jeuCity"
            element={
              <JeuCity
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
              />
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
