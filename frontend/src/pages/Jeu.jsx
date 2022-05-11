import { useState, useRef, useEffect } from "react";
import { useMediaQuery } from "react-responsive";
import { randomCountryQuestion, getRandomCountries } from "@services/api";
import allcountries from "@assets/allcountries.js";
import Globe from "@components/Globe";
import Responses from "@components/Reponses";
import Header from "@components/Header";
import GameCountdown from "@components/GameCountdown";

import earthImage from "@assets/Images/terre216K.jpeg";
import spaceImage from "@assets/Images/night-sky.png";

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

function Jeu({
  score,
  setScore,
  playerName,
  onFinished,
  renderQuestion,
  renderResponse,
}) {
  const globeRef = useRef();
  const [countryRandom, setCountryRandom] = useState([]);
  const [countryToGuess, setCountryToGuess] = useState();
  const [isGoodResponse, setIsGoodResponse] = useState(false);
  const [isBadResponse, setIsBadResponse] = useState(false);
  const [canRespond, setCanRespond] = useState(false);
  const [turn, setTurn] = useState(0);

  const isMobile = useMediaQuery({ query: "(max-width: 800px)" });

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
      <Header playerName={playerName} score={score} />

      <GameCountdown onFinished={onFinished} />

      <Globe
        height={isMobile ? 300 : 400}
        width={isMobile ? 400 : 1100}
        ref={globeRef}
        globeImageUrl={earthImage}
        backgroundImageUrl={spaceImage}
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

      {countryToGuess && renderQuestion(countryToGuess)}

      <Responses
        className={`responses${isMobile ? "-mobile" : ""}`}
        countryRandom={countryRandom}
        countryToGuess={countryToGuess}
        isGoodResponse={isGoodResponse}
        isBadResponse={isBadResponse}
        canRespond={canRespond}
        renderResponse={renderResponse}
        onResponse={onResponse}
      />
    </div>
  );
}

export default Jeu;
