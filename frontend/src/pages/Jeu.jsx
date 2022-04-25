import { getRandomCountries } from "@services/api";
import GlobeTest from "@pages/GlobeTest";
import ButtonReponse from "@components/ButtonReponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";
import Countdown from "@components/Countdown";
import Header from "@components/Header";
import { useState, useEffect } from "react";

function Jeu({ playerName }) {
  const [countryRandom, setCountryRandom] = useState([]);

  async function fetchRandomCountries() {
    setCountryRandom(await getRandomCountries(4));
  }

  useEffect(() => {
    fetchRandomCountries();
  }, []);

  return (
    <div className="Jeu">
      <Header playerName={playerName} />
      <GlobeTest />
      <Questions />
      {countryRandom.map((country) => (
        <ButtonReponse
          flag={country.flag}
          cname={country.translations.fra.common}
          // onCountry={fetchRandomCountries}
          onCountry={(countryflag) =>
            alert(`Tu as appuié sur ${countryflag} Bravo a toi`)
          }
        />
      ))}
      <Footer />
      <Countdown />
    </div>
  );
}

export default Jeu;
