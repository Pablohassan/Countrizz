import React from "react";
import "@assets/css/Header.css";

export default function Header({ playerName, score }) {
  return (
    <header className="Header">
      <p className="playerName"> {playerName}</p>

      <p className="playerScore"> score {score} </p>
    </header>
  );
}
