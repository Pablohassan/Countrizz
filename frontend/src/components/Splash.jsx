import { useEffect, useRef } from "react";
import lottie from "lottie-web";
import { useNavigate } from "react-router-dom";
import data1 from "@assets/Images/boucleterre.json";
import data from "@assets/Images/velo.json";

function Splash() {
  const container = useRef(null);
  const container1 = useRef(null);
  const container2 = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    lottie.loadAnimation({
      container: container.current,

      render: "svg",
      loop: false,
      autoplay: true,
      animationData: data,
    });
  }, []);

  useEffect(() => {
    lottie.loadAnimation({
      container: container1.current,
      render: "svg",
      loop: true,
      autoplay: true,
      animationData: data1,
    });
  }, []);

  useEffect(() => {
    lottie.loadAnimation({
      container: container2.current,
      render: "svg",
      loop: true,
      autoplay: true,
      animationData: data,
    });
  }, []);

  setTimeout(() => {
    navigate("/home");
  }, 9000);

  return (
    <div>
      <div className="containersplash" ref={container1} />
      <h1 className="titre-splash">Countrizz </h1>
      <div className="container2" ref={container} />
      {/* <div className="container3"  ref={container2} />  */}

      <h2 className="slide-in-left"> Le Groupetto vous presente </h2>
    </div>
  );
}

export default Splash;
