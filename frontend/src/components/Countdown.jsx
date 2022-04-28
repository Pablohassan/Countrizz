import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "@components/Countdown.css";

function UseDecrement() {
  const navigate = useNavigate();
  let timer;
  const [count, setCount] = useState(3);

  useEffect(() => {
    timer = setInterval(() => {
      setCount((prevCount) => {
        if (prevCount <= 1) {
          clearInterval(timer);
          navigate("/jeu");
        } else {
          setCount(prevCount - 1);
        }
      });
    }, 1000);
  }, []);

  return <div className="BtnCountdown">{count}</div>;
}

export default UseDecrement;
