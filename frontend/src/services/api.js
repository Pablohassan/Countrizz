import axios from "axios";

// URL de l'API des pays
const COUNTRY_API_URL = "https://restcountries.com/v3.1";

// Stocke la liste complète des pays en mémoire
let countryList;

/**
 * Retourne la liste complète des pays
 *
 * @returns {Promise<Array>}
 */
export const getAllCountries = async (filter) => {
  if (!countryList) {
    countryList = (await axios(`${COUNTRY_API_URL}/all`)).data;
  }

  if (filter) {
    return countryList.filter(filter);
  }

  return countryList;
};

/**
 * Retourne un pays aléatoire
 *
 * @returns {Promise<Object>}
 */
export const getRandomCountry = async (filter) => {
  const countries = await getAllCountries(filter);
  //  return countryList.find(c => c.translations.fra.common === "Palaos")
  return countries[Math.floor(Math.random() * (countries.length + 1))];
};

//Boucle qui s'appuie sur la function getRandomCountry pour alimentee un tableau avec 4 noms de pays issues de country

export const getRandomCountries = async (countriesCount = 4, filter) => {
  const randomCountries = [];

  for (let i = 0; i < countriesCount; i++) {
    let country = await getRandomCountry(filter);

    while (randomCountries.includes(country) || !country) {
      country = await getRandomCountry(filter);
    }

    randomCountries.push(country);
  }

  return randomCountries;
};

export const randomCountryQuestion = (randomCountries) => {
  const rand = Math.floor(Math.random() * randomCountries.length);
  const randomQuestion = randomCountries[rand];
  return randomQuestion;
};
