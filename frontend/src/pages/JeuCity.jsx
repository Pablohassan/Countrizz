import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { randomCountryQuestion, getRandomCountries } from "@services/api";
import allcountries from "@assets/allcountries.js";
import Globe from "@components/Globe";
import ButtonReponse from "@components/ButtonReponse";
import Footer from "@components/footer";
import Questions from "@components/Questions";
import Header from "@components/Header";

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
    return 0.8;
  }

  if (area > 100000) {
    return 0.6;
  }

  if (area > 50000) {
    return 0.5;
  }
  if (area > 25000) {
    return 0.4;
  }
  if (area > 1500) {
    return 0.3;
  }
  if (area > 1000) {
    return 0.2;
  }

  return 0.07;
};
function Jeu({ playerName }) {
  const globeRef = useRef();
  const [countryRandom, setCountryRandom] = useState([]);
  const [countryToGuess, setCountryToGuess] = useState();
  const [isGoodResponse, setIsGoodResponse] = useState(false);
  const [isBadResponse, setIsBadResponse] = useState(false);
  const [canRespond, setCanRespond] = useState(false);
  const [score, setScore] = useState(0);
  const [turn, setTurn] = useState(0);

  const navigate = useNavigate();

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

    globeRef.current.pointOfView(franceLocation, 1000);

    setTimeout(() => {
      globeRef.current.pointOfView(countryLocation, 2500);
      setCountryRandom(countries);
      setCountryToGuess(randomCountry);

      setTimeout(() => {
        setCanRespond(true);
      }, 2500);
    }, 1010);
  }

  useEffect(() => {
    nextRound();
    globeRef.current.controls().enabled = false;
  }, []);

  useEffect(() => {
    if (turn > 9) {
      setTimeout(() => navigate("/"), 1000);
    }
  }, [turn]);

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

      <Globe
        height={400}
        width={1100}
        ref={globeRef}
        globeImageUrl="../src/assets/Images/terre216k.jpeg"
        backgroundImageUrl="../src/assets/Images/night-sky.png"
        lineHoverPrecision={1}
        polygonsData={allcountries.features.filter((d) => d.id !== "AQ")}
        polygonAltitude={0.004}
        polygonCapColor={(d) =>
          countryToGuess && countryToGuess.cca3 === d.id
            ? "yellow"
            : "transparent"
        }
        polygonSideColor={() => "rgba(0, 100, 0, 0.15)"}
        polygonStrokeColor={() => "#111"}
        polygonsTransitionDuration={300}
      />

      {countryToGuess && (
        <Questions
          countryQuestion="Trouve la capitale de "
          name={countryToGuess.translations.fra.common}
        />
      )}

      <div className="responses">
        {countryRandom.map((country) => (
          <ButtonReponse
            key={country.cca3}
            disabled={!canRespond}
            success={
              isGoodResponse &&
              country.name.common === countryToGuess.name.common
            }
            fail={
              isBadResponse &&
              country.name.common !== countryToGuess.name.common
            }
            onClick={() => onResponse(country)}
          >
            {country.capital}
          </ButtonReponse>
        ))}
      </div>
      <Footer />
    </div>
  );
}

export default Jeu;
