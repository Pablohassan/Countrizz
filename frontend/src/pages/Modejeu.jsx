import "@pages/modejeu.css";
import Header from "@components/Header";
import ButtonPlay from "@components/ButtonPlay";
import Footer from "../components/footer";

export default function ModeJeu({ playerName }) {
  return (
    <div className="ModeJeu">
      <Header playerName={playerName} />
      <div>
        <h1 className="titreModejeu">Pret a Relever le défi?</h1>
        <div className="drapeau">
          {" "}
          <ButtonPlay name="Trouve Le Drapeau" to="/countdown" />{" "}
        </div>
        <div className="pays">
          {" "}
          <ButtonPlay name="Trouve Le Pays" to="/countdownPays" />{" "}
        </div>
        <div className="city">
          {" "}
          <ButtonPlay name="Trouve La Capitale" to="/countdowncity" />{" "}
        </div>
      </div>

      <Footer />
    </div>
  );
}
