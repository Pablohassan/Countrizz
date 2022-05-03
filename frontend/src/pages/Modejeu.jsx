import { Link } from "react-router-dom";

import Footer from "@components/footer";
import "@pages/modejeu.css";
import Header from "@components/Header";
import ButtonPlayFlag from "@components/ButtonPlayFlag";
import ButtonPlayPays from "@components/ButtonPlayPays";
import ButtonPlayCity from "@components/ButtonPlayCity";

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
        <ButtonPlayFlag name="Trouve Le Drapeau" />
        <ButtonPlayPays name="Trouve Le Pays" />
        <ButtonPlayCity name="Trouve La Capitale" />
      </div>

      <Footer />
    </div>
  );
}
