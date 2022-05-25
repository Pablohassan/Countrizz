import { useState, useRef, useEffect } from "react";
import { useMediaQuery } from "react-responsive";
import { randomCountryQuestion, getRandomCountries } from "@services/api";
import lottie from "lottie-web";
import allcountries from "@assets/allcountries.js";
import Globe from "@components/Globe";
import Responses from "@components/Reponses";
import Header from "@components/Header";
import GameCountdown from "@components/GameCountdown";
import earthImageM from "@assets/Images/earth4K.jpg";
import spaceImage from "@assets/Images/night-sky.png";
import fondbleu from "@assets/Images/fondbleu.png";
import earthImage from "../assets/Images/laterre4k.jpeg";
import data2 from "../assets/Images/CountdownAnimation.json";

const getAltitudeFromArea = (area) => {
  if (area > 10000000) {
    return 1.6;
  }

  if (area > 5000000) {
    return 1.4;
  }

  if (area > 1000000) {
    return 1.2;
  }
  if (area > 500000) {
    return 1.1;
  }

  if (area > 100000) {
    return 0.99;
  }
  if (area > 50000) {
    return 0.9;
  }

  if (area > 10000) {
    return 0.8;
  }

  if (area > 5000) {
    return 0.7;
  }
  if (area > 2500) {
    return 0.6;
  }
  if (area > 1500) {
    return 0.55;
  }
  if (area > 1000) {
    return 0.49;
  }
  if (area > 500) {
    return 0.39;
  }
  return 0.25;
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

  const isMobile = useMediaQuery({ query: "(max-width: 500px)" });

  const container3 = useRef(null);

  useEffect(() => {
    lottie.loadAnimation({
      container: container3.current,
      render: "svg",
      loop: false,
      autoplay: true,
      animationData: data2,
    });
  }, []);

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
      altitude: 2,
    };

    globeRef.current.pointOfView(franceLocation, 700);

    setTimeout(() => {
      globeRef.current.pointOfView(countryLocation, 1500);
      setCountryRandom(countries);
      setCountryToGuess(randomCountry);
      setTimeout(() => {
        setCanRespond(true);
      }, 400);
    }, 410);
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
      setTimeout(() => nextRound(), 600);
    } else {
      setIsBadResponse(true);
      setTurn(turn + 1);
      setTimeout(() => nextRound(), 600);
    }
  }
  return (
    <div className="Jeu">
      <Header playerName={playerName} score={score} />

      <GameCountdown onFinished={onFinished} />
      <div className="container3" ref={container3} />
      <Globe
        height={isMobile ? 800 : 750}
        width={isMobile ? 390 : 1300}
        ref={globeRef}
        globeImageUrl={isMobile ? earthImage : earthImageM}
        backgroundImageUrl={isMobile ? fondbleu : spaceImage}
        lineHoverPrecision={0}
        polygonsData={allcountries.features.filter((d) => d.id !== "AQ")}
        polygonAltitude={0.004}
        polygonCapColor={(d) =>
          countryToGuess && countryToGuess.cca3 === d.id
            ? "#ffee03a1"
            : "transparent"
        }
        polygonSideColor={() => "rgba(0, 20, 0, 0.00001)"}
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
