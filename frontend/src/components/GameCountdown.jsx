import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function GameCountdown() {
  const navigate = useNavigate();
  let timer;

  const [gameCount, setGameCount] = useState(60);

  useEffect(() => {
    timer = setInterval(() => {
      setGameCount((prevCount) => {
        if (prevCount <= 1) {
          clearInterval(timer);
          navigate("/");
        } else {
          setGameCount(prevCount - 1);
        }
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return <div className="BtnGameCountdown">{gameCount}</div>;
}

export default GameCountdown;
