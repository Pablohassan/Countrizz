import Jeu from "@pages/Jeu";
import Questions from "@components/Questions";

export default function JeuNomPays({
  score,
  setScore,
  playerName,
  onFinished,
}) {
  return (
    <Jeu
      score={score}
      playerName={playerName}
      setScore={setScore}
      onFinished={onFinished}
      renderQuestion={() => (
        // renderQuestion={(countryToGuess) => (
        <Questions
          countryQuestion="Quel est le nom de ce pays : "
          // name={countryToGuess.translations.fra.common}
        />
      )}
      renderResponse={(country) => country.translations.fra.common}
    />
  );
}
