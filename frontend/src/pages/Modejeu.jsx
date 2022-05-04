import { Link } from "react-router-dom";
import Footer from "@components/footer";
import "@pages/modejeu.css";
import Header from "@components/Header";
import ButtonPlay from "@components/ButtonPlay";

export default function ModeJeu({ playerName }) {
  return (
    <div className="ModeJeu">
      <nav>
        <ul>
          <li className="homeLink">
            <Link to="/"> Home </Link>
          </li>
        </ul>
      </nav>
      <Header playerName={playerName} />
      <div>
        <h1 className="titreModejeu">Pret a Relever le défi?</h1>
        <ButtonPlay name="Trouve Le Drapeau" to="/countdown" />
        <ButtonPlay name="Trouve Le Pays" to="/countdownPays" />
        <ButtonPlay name="Trouve La Capitale" to="/countdowncity" />
      </div>

      <Footer />
    </div>
  );
}
