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
import TableauScores from "@pages/TableauScores";

function App() {
  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState(0);
  const onGameEnd = (resultat) => {
    setScore(resultat);
  };
  const [gameCount, setGameCount] = useState(60);

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
              <Jeu
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
                onFinished={onGameEnd}
                gameCount={gameCount}
                setGameCount={setGameCount}
              />
            }
          />

          <Route
            path="/jeuPays"
            element={
              <JeuPays
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
                onFinished={onGameEnd}
                gameCount={gameCount}
                setGameCount={setGameCount}
              />
            }
          />
          <Route
            path="/jeuCity"
            element={
              <JeuCity
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
                onFinished={onGameEnd}
                gameCount={gameCount}
                setGameCount={setGameCount}
              />
            }
          />
          <Route
            path="/scores"
            element={<TableauScores playerName={playerName} score={score} />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
