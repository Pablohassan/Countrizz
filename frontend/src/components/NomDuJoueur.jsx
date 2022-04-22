export default function NomDuJoueur({ playerName = "", onChange }) {
  return (
    <div className="PlayerName">
      <h2>Entrez votre Nom</h2>
      <input
        className="ChooseName"
        value={playerName}
        type="text"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
