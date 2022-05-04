import ButtonPlay from "@components/ButtonPlay";
import Footer from "@components/footer";
import NomDuJoueur from "@components/NomDuJoueur";

export default function Home({ playerName, onPlayerNameChange }) {
  return (
    <>
      <div>
        <h1 className="titre">Countrizz</h1>
        <NomDuJoueur playerName={playerName} onChange={onPlayerNameChange} />
        <ButtonPlay name="LET'S GO" to="/modejeu" />
      </div>

      <Footer />
    </>
  );
}
