import { getRandomCountries } from "@services/api";
import GlobeTest from "@pages/GlobeTest";
import ButtonReponse from "@components/ButtonReponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";
import Header from "@components/Header";

function Jeu({ playerName }) {
  async function fetchRandomCountries() {
    console.error(await getRandomCountries(4));
  }

  return (
    <div className="Jeu">
      <button type="button" onClick={fetchRandomCountries}>
        CLICK
      </button>
      <Header playerName={playerName} />
      <GlobeTest />
      <Questions />
      <ButtonReponse />
      <Footer />
    </div>
  );
}

export default Jeu;
