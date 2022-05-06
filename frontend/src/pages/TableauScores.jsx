import { useEffect, useState } from "react";

import { getScores } from "@services/api";
import Header from "@components/Header";

export default function TableauScores({ playerName, playerScore }) {
  const [scores, setScores] = useState([]);

  useEffect(async () => {
    setScores(await getScores());
  }, []);

  return (
    <div className="finalScore">
      <Header playerName={playerName} score={playerScore} />

      <div>Tableau Scores</div>

      {scores.map((score) => (
        <p>
          {score.name} : {score.score}
        </p>
      ))}
    </div>
  );
}
