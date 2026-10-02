import React from "react";
import "@assets/css/Questions.css";

export default function Questions({ countryQuestion, name, flag }) {
  return (
    <div className="champsQst">
      {countryQuestion}

      {name}
      {flag}
    </div>
  );
}
