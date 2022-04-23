import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function UseDecrement() {
  const navigate = useNavigate();
  let timer;
  const [count, setCount] = useState(5);

  useEffect(() => {
    timer = setInterval(() => {
      setCount((prevCount) => {
        if (prevCount <= 0) {
          clearInterval(timer);
          navigate("/jeu");
        } else {
          setCount(prevCount - 1);
        }
      });
    }, 1000);
  }, []);

  return (
    <>
      <div>Countdown</div>
      <button type="button"> count {count}</button>
    </>
  );
}

export default UseDecrement;
