import { useState } from "react";
import ModeJeu from "@pages/Modejeu";
import Jeu from "@pages/Jeu";
import JeuPays from "@pages/JeuPays";
import JeuCity from "@pages/JeuCity";
import Home from "@pages/Home";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { addScores } from "@services/api";

import "./App.css";

import UseDecrement from "@components/Countdown";
import UseDecrementPays from "@components/CountdownPays";
import UseDecrementCity from "@components/ContdownCity";
import TableauScores from "@pages/TableauScores";
import Splash from "@components/Splash";
import Congrate from "@components/Congrate";

function App() {
  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState(0);
  const [gameCount, setGameCount] = useState(60);

  const onGameEnd = async (resultat) => {
    setScore(resultat);
    await addScores(playerName, resultat);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route
            path="/home"
            element={
              <Home
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
              />
            }
          />

          <Route path="/" element={<Splash />} />
          <Route path="/modejeu" element={<ModeJeu />} />
          <Route
            path="/congrate"
            element={<Congrate playerName={playerName} playerScore={score} />}
          />

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
            element={
              <TableauScores playerName={playerName} playerScore={score} />
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
