import { getRandomCountries } from "@services/api";
import GlobeTest from "@pages/GlobeTest";
import ButtonReponse from "@components/ButtonReponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";
import Countdown from "@components/Countdown";

function Jeu() {
  async function fetchRandomCountries() {
    console.error(await getRandomCountries(4));
  }

  return (
    <div className="Jeu">
      <button type="button" onClick={fetchRandomCountries}>
        CLICK
      </button>
      <GlobeTest />
      <Questions />
      <ButtonReponse />
      <Footer />
      <Countdown />
    </div>
  );
}

export default Jeu;
