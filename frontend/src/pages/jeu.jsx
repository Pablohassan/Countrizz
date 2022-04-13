import GlobeTest from "@pages/GlobeTest";
import ButtonReponse from "@components/Reponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";

function Jeu() {
  return (
    <div className="Jeu">
      <GlobeTest />
      <Questions />
      <ButtonReponse />
      <Footer />
    </div>
  );
}

export default Jeu;
