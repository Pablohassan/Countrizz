import React from "react";
import "@components/Questions.css";

export default function Questions({ countryQuestion }) {
  return (
    <div className="champsQst">Quel est le drapeau de {countryQuestion} ?</div>
  );
}
