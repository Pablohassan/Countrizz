const fs = require("fs").promises;
const path = require("path");

// URL de l'API des pays
const COUNTRY_API_URL = "https://restcountries.com/v3.1/all?fields=name,capital,latlng,area,cca3,flags,translations";

// Emplacement du fichier countries.json
const COUNTRIES_FILE_PATH = path.join(__dirname, "..", "data", "countries.json");

async function shouldUpdateCountriesFile() {
  try {
    const response = await fetch(COUNTRY_API_URL, { method: "HEAD" });
    const lastModifiedHeader = response.headers.get("last-modified");
    
    // If no last-modified header, we can't compare, so maybe just rely on file existence
    // or always update. Let's assume if we can't check, we try to update if file missing.
    if (!lastModifiedHeader) return true;

    const lastModified = new Date(lastModifiedHeader);
    const countriesFileStats = await fs.stat(COUNTRIES_FILE_PATH).catch(() => null);

    return !countriesFileStats || lastModified > countriesFileStats.mtime;
  } catch (error) {
    console.warn("Error checking for updates:", error.message);
    // If API check fails, try to use local file
    return false;
  }
}

async function getCountries(req, res) {
  let countries;

  try {
    const updateNeeded = await shouldUpdateCountriesFile();
    
    if (updateNeeded) {
      const response = await fetch(COUNTRY_API_URL);
      if (!response.ok) throw new Error(`Failed to fetch countries: ${response.statusText}`);
      countries = await response.json();
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(COUNTRIES_FILE_PATH), { recursive: true });
      await fs.writeFile(COUNTRIES_FILE_PATH, JSON.stringify(countries));
    } else {
      const data = await fs.readFile(COUNTRIES_FILE_PATH, "utf-8");
      countries = JSON.parse(data);
    }

    res.json(countries);
  } catch (error) {
    console.error("Error in getCountries:", error);
    // Attempt to serve stale data if available
    try {
        const data = await fs.readFile(COUNTRIES_FILE_PATH, "utf-8");
        res.json(JSON.parse(data));
    } catch (fallbackError) {
        res.status(500).json({ error: "Could not load countries data" });
    }
  }
}

module.exports = { getCountries };
