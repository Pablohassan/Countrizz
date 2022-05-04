import React from "react";
import "@components/Header.css";

export default function Header({ playerName, score, children }) {
  return (
    <header className="Header">
      <p className="playerName"> {playerName}</p>
      <p className="playerScore"> Score {score} </p>
      {children}
    </header>
  );
}
