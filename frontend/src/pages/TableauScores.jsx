import Header from "@components/Header";
import React from "react";

export default function TableauScores({ playerName, score }) {
  return (
    <div className="finalScore">
      <Header playerName={playerName} score={score} />

      <h1>TableauScores</h1>
    </div>
  );
}
