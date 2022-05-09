import React from "react";
import "@components/Questions.css";

export default function Questions({ countryQuestion, name, flag }) {
  return (
    <div>
      <div className="champsQst">
        {countryQuestion}

        {name}
        {flag}
      </div>
    </div>
  );
}
