export default function NomDuJoueur({ playerName = "", onChange }) {
  return (
    <div className="PlayerName">
      <input
        className="ChooseName"
        value={playerName}
        type="text"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
