import "@components/Reponse.css";

export default function ButtonReponse({ flag, onCountry }) {
  return (
    <div className="wrapperRep">
      <button type="button" className="ctaRep" onClick={onCountry}>
        <span>
          <img src={flag} alt="Drapeau du pays" height="50" />
        </span>
      </button>
    </div>
  );
}
