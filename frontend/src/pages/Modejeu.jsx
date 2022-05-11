import { Link } from "react-router-dom";
import "@pages/modejeu.css";
import ButtonPlay from "@components/ButtonPlay";
import Footer from "../components/footer";

export default function ModeJeu() {
  return (
    <div className="ModeJeu">
      <nav>
        <ul>
          <li className="homeLink">
            <Link to="/"> Home </Link>
          </li>
        </ul>
      </nav>
      <div>
        <h1 className="titreModejeu">Choisis ton niveau de difficulté !</h1>
        <div className="BtnContainer">
          <div className="BtnDrapeau">
            {" "}
            <ButtonPlay
              name="Niv 1 ⭐: Trouve le Drapeau "
              to="/countdown"
            />{" "}
          </div>
          <div className="BtnPays">
            {" "}
            <ButtonPlay
              name="Niv 2 ⭐⭐: Trouve le Pays"
              to="/countdownPays"
            />{" "}
          </div>
          <div className="BtnCity">
            {" "}
            <ButtonPlay
              name="Niv 3 ⭐⭐⭐: Trouve la Capitale"
              to="/countdowncity"
            />{" "}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
