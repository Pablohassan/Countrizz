import "@components/Reponse.css";

export default function ButtonReponse({ success, flag, onClick, fail }) {
  return (
    <div className="wrapperRep">
      <button
        type="button"
        className={`ctaRep ${success ? "greenBtn" : ""}${fail ? "redBtn" : ""}`}
        onClick={onClick}
      >
        <span>
          <img src={flag} alt="Drapeau du pays" height="50" />
        </span>
      </button>
    </div>
  );
}
