import { useEffect, useState } from "react";

import { getScores } from "@services/api";
import Header from "@components/Header";
import { Link } from "react-router-dom";
import Footer from "../components/footer";

export default function TableauScores({ playerName, playerScore }) {
  const [scores, setScores] = useState([]);

  useEffect(async () => {
    setScores(await getScores());
  }, []);

  return (
    <div className="finalScore">
      <nav>
        <ul>
          <li className="homeLink">
            <Link to="/"> Home </Link>
          </li>
        </ul>
      </nav>
      <Header playerName={playerName} score={playerScore} />

      <div>Tableau Scores</div>

      {scores.map((score) => (
        <p>
          {score.name} : {score.score}
        </p>
      ))}
      <Footer />
    </div>
  );
}
