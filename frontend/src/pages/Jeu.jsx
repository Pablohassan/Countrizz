import { useState, useRef, useEffect } from "react";

import { randomCountryQuestion, getRandomCountries } from "@services/api";
import allcountries from "@assets/allcountries.js";
import Globe from "@components/Globe";
import ButtonReponse from "@components/ButtonReponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";
import Countdown from "@components/Countdown";
import Header from "@components/Header";

const getAltitudeFromArea = (area) => {
  if (area > 10000000) {
    return 2;
  }

  if (area > 1000000) {
    return 1.6;
  }

  if (area > 1000000) {
    return 1.4;
  }

  if (area > 500000) {
    return 1;
  }

  if (area > 100000) {
    return 0.8;
  }
  if (area > 50000) {
    return 0.6;
  }

  return 0.2;
};

function Jeu({ playerName }) {
  const globeRef = useRef();
  const [countryRandom, setCountryRandom] = useState([]);
  const [countryToGuess, setCountryToGuess] = useState();

  async function nextRound() {
    const countries = await getRandomCountries(4);
    const randomCountry = randomCountryQuestion(countries);

    const countryLocation = {
      lat: randomCountry.latlng[0],
      lng: randomCountry.latlng[1],
      altitude: getAltitudeFromArea(randomCountry.area),
    };

    globeRef.current.pointOfView(countryLocation, 4000);

    setCountryRandom(countries);
    setCountryToGuess(randomCountry);
  }

  useEffect(() => {
    nextRound();
    globeRef.current.controls().enabled = false;
  }, []);

  return (
    <div className="Jeu">
      <Header playerName={playerName} />

      <button type="button" onClick={nextRound}>
        NEXT ROUND
      </button>

      <Globe
        height={400}
        width={390}
        ref={globeRef}
        globeImageUrl="../src/assets/Images/laterre8k.jpeg"
        backgroundImageUrl="../src/assets/Images/night-sky.png"
        lineHoverPrecision={0}
        polygonsData={allcountries.features.filter(
          (d) => d.properties.ISO_A2 !== "AQ"
        )}
        polygonAltitude={0.004}
        polygonCapColor={(d) =>
          countryToGuess && countryToGuess.cca2 === d.properties.ISO_A2
            ? "yellow"
            : "transparent"
        }
        polygonSideColor={() => "rgba(0, 100, 0, 0.15)"}
        polygonStrokeColor={() => "#111"}
        polygonsTransitionDuration={300}
      />

      {countryToGuess && (
        <Questions countryQuestion={countryToGuess.name.common} />
      )}

      {countryRandom.map((country) => (
        <ButtonReponse
          flag={country.flags.png}
          // cname={country.translations.fra.common}
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
