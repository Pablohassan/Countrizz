import GlobeTest from "@pages/GlobeTest";
import ButtonReponse from "@components/Reponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";
import Countdown from "@components/Countdown";

function Jeu() {
  return (
    <div className="Jeu to-delete">
      <GlobeTest />
      <Questions />
      <ButtonReponse />
      <Footer />
      <Countdown />
    </div>
  );
}

export default Jeu;
