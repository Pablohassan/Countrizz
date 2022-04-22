import React from "react";
import "@components/Header.css";

export default function Header({ playerName }) {
  return (
    <header className="Header">
      <p className="playerName">{playerName}</p>
      <p>Score</p>
    </header>
  );
}
