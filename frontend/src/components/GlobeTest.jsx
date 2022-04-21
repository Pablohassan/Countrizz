import { useState, useMemo, useRef, useEffect } from "react";
import * as d3 from "d3";

import { getRandomCountry } from "@services/api";
import Globe from "@components/Globe";
import countries from "@assets/countries.js";

export default function GlobeTest() {
  const globeRef = useRef();
  const [selectedCountry, setSelectedCountry] = useState();

  const colorScale = d3.scaleSequentialSqrt(d3.interpolateYlOrRd);

  useEffect(() => {
    globeRef.current.controls().enabled = false;
  }, []);

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

  const selectRandomCountry = async () => {
    const country = await getRandomCountry();

    const countryLocation = {
      lat: country.latlng[0],
      lng: country.latlng[1],
      altitude: getAltitudeFromArea(country.area),
    };

    globeRef.current.pointOfView(countryLocation, 4000);
    setSelectedCountry(country);
  };

  const getVal = (feat) =>
    feat.properties.GDP_MD_EST / Math.max(1e5, feat.properties.POP_EST);

  const maxVal = useMemo(
    () => Math.max(...countries.features.map(getVal)),
    [countries]
  );

  colorScale.domain([0, maxVal]);

  return (
    <>
      <button type="button" onClick={selectRandomCountry}>
        PAYS ALEATOIRE{" "}
        {selectedCountry && <>({selectedCountry.translations.fra.common})</>}
      </button>

      <Globe
        height={400}
        width={390}
        ref={globeRef}
        globeImageUrl="../src/assets/Images/laterre8k.jpeg"
        backgroundImageUrl="../src/assets/Images/night-sky.png"
        lineHoverPrecision={0}
        polygonsData={countries.features.filter(
          (d) => d.properties.ISO_A2 !== "AQ"
        )}
        polygonAltitude={0.004}
        polygonCapColor={(d) =>
          selectedCountry && selectedCountry.cca2 === d.properties.ISO_A2
            ? "yellow"
            : "transparent"
        }
        polygonSideColor={() => "rgba(0, 100, 0, 0.15)"}
        polygonStrokeColor={() => "#111"}
        polygonsTransitionDuration={300}
      />
    </>
  );
}
