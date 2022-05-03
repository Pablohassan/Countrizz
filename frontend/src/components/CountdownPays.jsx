import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "@components/Countdown.css";

function UseDecrementPays() {
  const navigate = useNavigate();
  let timer;
  const [count, setCount] = useState(3);

  useEffect(() => {
    timer = setInterval(() => {
      setCount((prevCount) => {
        if (prevCount <= 1) {
          clearInterval(timer);
          navigate("/jeuPays");
        } else {
          setCount(prevCount - 1);
        }
      });
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return <div className="BtnCountdown">{count}</div>;
}

export default UseDecrementPays;
