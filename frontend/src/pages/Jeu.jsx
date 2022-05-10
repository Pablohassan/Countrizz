import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { randomCountryQuestion, getRandomCountries } from "@services/api";
import allcountries from "@assets/allcountries.js";
import Globe from "@components/Globe";
import ButtonReponse from "@components/ButtonReponse";
import Questions from "@components/Questions";
import Header from "@components/Header";
import GameCountdown from "@components/GameCountdown";
import MediaQuery from "react-responsive";

const getAltitudeFromArea = (area) => {
  if (area > 10000000) {
    return 1.2;
  }
  if (area > 5000000) {
    return 1.1;
  }

  if (area > 1000000) {
    return 1;
  }
  if (area > 500000) {
    return 0.7;
  }

  if (area > 1000000) {
    return 0.6;
  }
  if (area > 500000) {
    return 0.5;
  }

  if (area > 100000) {
    return 0.4;
  }

  if (area > 50000) {
    return 0.3;
  }
  if (area > 25000) {
    return 0.2;
  }
  if (area > 1500) {
    return 0.1;
  }
  if (area > 1000) {
    return 0.09;
  }

  return 0.07;
};
function Jeu({ playerName, onFinished, gameCount }) {
  const globeRef = useRef();
  const [countryRandom, setCountryRandom] = useState([]);
  const [countryToGuess, setCountryToGuess] = useState();
  const [isGoodResponse, setIsGoodResponse] = useState(false);
  const [isBadResponse, setIsBadResponse] = useState(false);
  const [canRespond, setCanRespond] = useState(false);
  const [score, setScore] = useState(0);
  const [turn, setTurn] = useState(0);

  async function nextRound() {
    setIsGoodResponse(false);
    setIsBadResponse(false);
    const countries = await getRandomCountries(4);
    const randomCountry = randomCountryQuestion(countries);

    const countryLocation = {
      lat: randomCountry.latlng[0],
      lng: randomCountry.latlng[1],
      altitude: getAltitudeFromArea(randomCountry.area),
    };

    const franceLocation = {
      altitude: 1,
    };

    globeRef.current.pointOfView(franceLocation, 600);

    setTimeout(() => {
      globeRef.current.pointOfView(countryLocation, 1500);
      setCountryRandom(countries);
      setCountryToGuess(randomCountry);

      setTimeout(() => {
        setCanRespond(true);
      }, 500);
    }, 510);
  }

  useEffect(() => {
    nextRound();
    globeRef.current.controls().enabled = false;
  }, []);

  function onResponse(country) {
    setCanRespond(false);

    if (country.name.common === countryToGuess.name.common) {
      setIsGoodResponse(true);

      setTurn(turn + 1);
      setScore(score + 10);
      setTimeout(() => nextRound(), 500);
    } else {
      setIsBadResponse(true);

      setTurn(turn + 1);
      setTimeout(() => nextRound(), 500);
    }
  }

  return (
    <div className="Jeu">
      <nav>
        <ul>
          <li className="homeLink">
            <Link to="/"> Home </Link>
          </li>
        </ul>
      </nav>
      <Header playerName={playerName} score={score} />
      <GameCountdown
        onFinished={() => onFinished(score)}
        gameCount={gameCount}
      />
      <MediaQuery minWidth={800}>
        <Globe
          height={400}
          width={1200}
          ref={globeRef}
          globeImageUrl="../src/assets/Images/terre216k.jpeg"
          backgroundImageUrl="../src/assets/Images/night-sky.png"
          lineHoverPrecision={0}
          polygonsData={allcountries.features.filter((d) => d.id !== "AQ")}
          polygonAltitude={0.003}
          polygonCapColor={(d) =>
            countryToGuess && countryToGuess.cca3 === d.id
              ? "yellow"
              : "transparent"
          }
          polygonSideColor={() => "rgba(0, 100, 0, 0.15)"}
          polygonStrokeColor={() => "#111"}
          polygonsTransitionDuration={300}
        />
      </MediaQuery>

      <MediaQuery maxWidth={800}>
        <Globe
          height={500}
          width={400}
          ref={globeRef}
          globeImageUrl="../src/assets/Images/terre216k.jpeg"
          backgroundImageUrl="../src/assets/Images/night-sky.png"
          lineHoverPrecision={0}
          polygonsData={allcountries.features.filter((d) => d.id !== "AQ")}
          polygonAltitude={0.003}
          polygonCapColor={(d) =>
            countryToGuess && countryToGuess.cca3 === d.id
              ? "yellow"
              : "transparent"
          }
          polygonSideColor={() => "rgba(0, 100, 0, 0.15)"}
          polygonStrokeColor={() => "#111"}
          polygonsTransitionDuration={300}
        />
      </MediaQuery>

      {countryToGuess && (
        <Questions
          countryQuestion="Quel est le drapeau de ce pays : "
          name={countryToGuess.translations.fra.common}
        />
      )}
      <MediaQuery minWidth={800}>
        <div className="responses">
          {countryRandom.map((country) => (
            <ButtonReponse
              key={country.cca3}
              success={
                isGoodResponse &&
                country.name.common === countryToGuess.name.common
              }
              fail={
                isBadResponse &&
                country.name.common !== countryToGuess.name.common
              }
              image={country.flags.svg}
              disabled={!canRespond}
              onClick={() => onResponse(country)}
            >
              <img src={country.flags.svg} alt="name" width="50" />
            </ButtonReponse>
          ))}
        </div>
      </MediaQuery>
      <MediaQuery maxWidth={800}>
        <div className="responses-mobile">
          {countryRandom.map((country) => (
            <ButtonReponse
              key={country.cca3}
              success={
                isGoodResponse &&
                country.name.common === countryToGuess.name.common
              }
              fail={
                isBadResponse &&
                country.name.common !== countryToGuess.name.common
              }
              image={country.flags.svg}
              disabled={!canRespond}
              onClick={() => onResponse(country)}
            >
              <img src={country.flags.svg} alt="name" width="50" />
            </ButtonReponse>
          ))}
        </div>
      </MediaQuery>
    </div>
  );
}

export default Jeu;
