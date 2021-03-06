import { useState, useRef, useEffect } from "react";
import { useTransition } from "react-spring";
import { useMediaQuery } from "react-responsive";
import { randomCountryQuestion, getRandomCountries } from "@services/api";
import allcountries from "@assets/allcountries.js";
import Globe from "@components/Globe";
import Responses from "@components/Reponses";
import Header from "@components/Header";
import GameCountdown from "@components/GameCountdown";
import bumpimg from "@assets/Images/bump4k.jpg";
import bumpd from "@assets/Images/bump4kD.jpg";
import earthImageM from "@assets/Images/earth4K.jpg";
import spaceImage from "@assets/Images/night-sky.png";
import * as THREE from "three";
import ocean from "@assets/Images/ocean10kM.jpg";
import earthImage from "../assets/Images/laterre4k.jpeg";

const globeMaterial = new THREE.MeshPhongMaterial();
globeMaterial.bumpScale = 3;
globeMaterial.bumpAltitude = 1;
new THREE.TextureLoader().load(ocean, (texture) => {
  globeMaterial.specularMap = texture;
  globeMaterial.specular = new THREE.Color("grey");
  globeMaterial.shininess = 18;
});

const getAltitudeFromArea = (area) => {
  if (area > 10000000) {
    return 1.4;
  }

  if (area > 5000000) {
    return 1.2;
  }

  if (area > 1000000) {
    return 1;
  }
  if (area > 500000) {
    return 0.9;
  }

  if (area > 100000) {
    return 0.85;
  }
  if (area > 50000) {
    return 0.7;
  }

  if (area > 10000) {
    return 0.6;
  }

  if (area > 5000) {
    return 0.55;
  }
  if (area > 2500) {
    return 0.5;
  }
  if (area > 1500) {
    return 0.45;
  }
  if (area > 1000) {
    return 0.39;
  }
  if (area > 500) {
    return 0.29;
  }
  return 0.19;
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
  const [isVisible, setIsVisible] = useState(true);

  const transition = useTransition(isVisible, {});
  const isMobile = useMediaQuery({ query: "(max-width: 500px)" });
  async function nextRound() {
    setIsGoodResponse(false);
    setIsBadResponse(false);

    const countries = await getRandomCountries(4);
    const randomCountry = randomCountryQuestion(countries);
    setTimeout(() => setIsVisible(true), 1700);
    const countryLocation = {
      lat: randomCountry.latlng[0],
      lng: randomCountry.latlng[1],
      altitude: getAltitudeFromArea(randomCountry.area),
    };

    const franceLocation = {
      altitude: 1.4,
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
    setTimeout(() => setIsVisible(false), 400);
  }
  return (
    <div className="Jeu">
      <Header playerName={playerName} score={score} />

      <GameCountdown onFinished={onFinished} />

      <Globe
        height={isMobile ? 850 : 700}
        width={isMobile ? 400 : 1200}
        ref={globeRef}
        globeMaterial={globeMaterial}
        globeImageUrl={isMobile ? earthImage : earthImageM}
        backgroundImageUrl={spaceImage}
        bumpImageUrl={isMobile ? bumpimg : bumpd}
        bumpMap
        clouds
        bumpAltitude
        showAtmosphere
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

      {transition((style, item) =>
        item ? (
          <Responses
            style={style}
            className={`responses${isMobile ? "-mobile" : ""}`}
            countryRandom={countryRandom}
            countryToGuess={countryToGuess}
            isGoodResponse={isGoodResponse}
            isBadResponse={isBadResponse}
            canRespond={canRespond}
            renderResponse={renderResponse}
            onResponse={onResponse}
          />
        ) : (
          ""
        )
      )}
    </div>
  );
}

export default Jeu;
