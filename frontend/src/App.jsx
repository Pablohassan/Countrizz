import React, { useState, useRef, useEffect, Suspense } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
// import ModeJeu from "@pages/Modejeu";
// import JeuPays from "@pages/JeuPays";
// import JeuCity from "@pages/JeuCity";
import Home from "@pages/Home";
import { addScores } from "@services/api";

import "./App.css";
import UseDecrement from "@components/Countdown";
import UseDecrementPays from "@components/CountdownPays";
import UseDecrementCity from "@components/ContdownCity";
import TableauScores from "@pages/TableauScores";
import Splash from "@components/Splash";
import Congrate from "@pages/Congrate";

const JeuDrapeaux = React.lazy(() => import("@pages/JeuDrapeaux")); // eslint-disable-line no-console,
const JeuPays = React.lazy(() => import("@pages/JeuPays")); // eslint-disable-line no-console,
const JeuCity = React.lazy(() => import("@pages/JeuCity")); // eslint-disable-line no-console,
// eslint-disable-next-line import/no-unresolved
const ModeJeu = React.lazy(() => import("@pages/ModeJeu")); // eslint-disable-line no-console,

function App() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState(0);
  const scoreRef = useRef(score);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const onGameEnd = async () => {
    await addScores(playerName, scoreRef.current);
    setScore(0);
    navigate("/congrate");
  };

  return (
    <div className="App">
      <Suspense fallback={<div>Loading...</div>}>
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
          <Route
            path="/modejeu"
            element={<ModeJeu playerName={playerName} />}
          />
          <Route
            path="/congrate"
            element={<Congrate playerName={playerName} playerScore={score} />}
          />
          <Route path="/modejeu" element={<ModeJeu />} />
          <Route path="/countdown" element={<UseDecrement />} />
          <Route path="/countdownPays" element={<UseDecrementPays />} />
          <Route path="/countdownCity" element={<UseDecrementCity />} />

          <Route path="/modejeu" element={<ModeJeu />} />

          <Route
            path="/jeu"
            element={
              <JeuDrapeaux
                score={score}
                setScore={setScore}
                playerName={playerName}
                onFinished={onGameEnd}
              />
            }
          />

          <Route
            path="/jeuPays"
            element={
              <JeuPays
                score={score}
                setScore={setScore}
                playerName={playerName}
                onFinished={onGameEnd}
              />
            }
          />

          <Route
            path="/jeuCity"
            element={
              <JeuCity
                score={score}
                setScore={setScore}
                playerName={playerName}
                onFinished={onGameEnd}
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
      </Suspense>
    </div>
  );
}

export default App;
