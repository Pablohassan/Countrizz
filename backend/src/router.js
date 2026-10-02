const express = require("express");
const countriesController = require("./controllers/countries");

const { ScoreController } = require("./controllers");

const router = express.Router();


router.get("/api/countries", countriesController.getCountries);
router.get("/scores", ScoreController.browse);
router.get("/scores/:id", ScoreController.read);
router.put("/scores/:id", ScoreController.edit);
router.post("/scores", ScoreController.add);
router.delete("/scores/:id", ScoreController.delete);

module.exports = router;
