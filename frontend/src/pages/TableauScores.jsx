import { useEffect, useState } from "react";

import { getScores } from "@services/api";
import { Link } from "react-router-dom";
import Footer from "../components/footer";

export default function TableauScores() {
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

      <h1>Top Scores</h1>

      <table>
        <tbody>
          {scores.map(({ name, score }) => (
            <tr>
              <td>{name}</td>
              <td>{score}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Footer />
    </div>
  );
}
