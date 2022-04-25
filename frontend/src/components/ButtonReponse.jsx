import "@components/Reponse.css";

export default function ButtonReponse({ cname, flag, onCountry }) {
  return (
    <div className="wrapperRep">
      <button
        type="button"
        className="ctaRep"
        onClick={() => onCountry && onCountry(cname)}
      >
        {cname} <span>{flag}</span>
      </button>
    </div>
  );
}
