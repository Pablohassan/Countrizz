export default function NomDuJoueur({ playerName = "", onChange }) {
  return (
    <div className="PlayerName">
      <input
        className="ChooseName"
        value={playerName}
        required
        maxLength="12"
        type="text"
        placeholder="Entrez votre nom"
        size={90}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
