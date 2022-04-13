import fromKapsule from "react-kapsule";
import GlobeKapsule from "globe.gl";

const Globe = fromKapsule(GlobeKapsule, {
  methodNames: [
    "pauseAnimation",
    "resumeAnimation",
    "pointOfView",
    "scene",
    "camera",
    "renderer",
    "postProcessingComposer",
    "controls",
    "getGlobeRadius",
    "getCoords",
    "getScreenCoords",
    "toGeoCoords",
    "toGlobeCoords",
  ],
  initPropNames: ["animateIn", "waitForGlobeReady", "rendererConfig"],
});

Globe.displayName = "Globe";

export default Globe;
