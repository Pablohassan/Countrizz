import Jeu from "@pages/Jeu";
import Questions from "@components/Questions";

export default function JeuDrapeaux({
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
        // 1/2 renderQuestion={(countryToGuess) => (
        <Questions
          countryQuestion="Quel est le drapeau de ce pays : "
          // 2/2 name={countryToGuess.translations.fra.common}
        />
      )}
      renderResponse={(country) => (
        <img src={country.flags.svg} alt="name" height={70} />
      )}
    />
  );
}
