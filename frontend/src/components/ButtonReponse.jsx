import "@components/Reponse.css";

export default function ButtonReponse({ success, flag, onClick }) {
  return (
    <div className="wrapperRep">
      <button
        type="button"
        className={`ctaRep ${success ? "greenBtn" : ""}`}
        onClick={onClick}
      >
        <span>
          <img src={flag} alt="Drapeau du pays" height="50" />
        </span>
      </button>
    </div>
  );
}
