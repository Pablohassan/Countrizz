import { Link } from "react-router-dom";

import "@assets/css/ButtonPlay.css";

export default function ButtonPlayFlag({ name }) {
  return (
    <div className="wrapper">
      <Link className="cta" to="/countdown">
        <span className="BtnPlay">{name}</span>
        <span>
          <svg width="66px" height="43px" viewBox="0 0 66 43" version="1.1">
            <g
              id="arrow"
              stroke="none"
              strokeWidth="1"
              fill="none"
              fillRule="evenodd"
            />
          </svg>
        </span>
      </Link>
    </div>
  );
}
