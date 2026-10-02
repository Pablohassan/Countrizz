
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import WebGPURenderer from "../assets/webgpu/WebGPURenderer"
import earthTexture from "../assets/images/earth4k.jpg";
import cloudsTexture from "../assets/images/clouds.png";

function EarthComponent({
    globeMaterial,
    earthImageUrl,
    bumpImageUrl,
    alpha,
    showAtmosphere,
    backgroundImageUrl,
    lineHoverPrecision,
    polygonsData,
    polygonAltitude,
    polygonCapColor,
    polygonSideColor,
    polygonStrokeColor,
    polygonsTransitionDuration,
  }) {
    
  const containerRef = useRef();
  const rendererRef = useRef();
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000));
  const controlsRef = useRef();
  const earthRotationSpeed = 0.001;
  // const cloudsRotationSpeed = 0.0012;

  const createAtmosphereMaterial = () => {
    return new THREE.MeshStandardMaterial({
      color: 0x93cfef,
      emissive: 0x1a3a5c,
      emissiveIntensity: 0.9,
      metalness: 0,
      roughness: 0.1,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
  };

  useEffect(() => {
    if (containerRef.current) {
      rendererRef.current = new WebGPURenderer();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      containerRef.current.appendChild(rendererRef.current.domElement);

      const earthGeometry = new THREE.SphereGeometry(4, 64, 64);
      const earthMaterial = new THREE.MeshStandardMaterial({
        map: new THREE.TextureLoader().load(earthImageUrl),
        bumpMap: new THREE.TextureLoader().load(bumpImageUrl),
        bumpScale: 0.2, // Adjust this value to control the intensity of the bump effect
      });
      const earth = new THREE.Mesh(earthGeometry, earthMaterial);
      sceneRef.current.add(earth);

      if (backgroundImageUrl) {
        const backgroundTexture = new THREE.TextureLoader().load(backgroundImageUrl);
        sceneRef.current.background = backgroundTexture;
      }

      // const cloudsGeometry = new THREE.SphereGeometry(4.01, 64, 64);
      // const cloudsMaterial = new THREE.MeshStandardMaterial({
      //   map: new THREE.TextureLoader().load(cloudsTexture),
      //   transparent: true,
      //   opacity: 0.8,
      // });
      // const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
      // sceneRef.current.add(clouds);

            // Add directional light (sunlight)
            const sunlight = new THREE.DirectionalLight(0xffffff, 1);
            sunlight.position.set(6, 3, 6);
            sceneRef.current.add(sunlight);

      // Add ambient light
      const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
      sceneRef.current.add(ambientLight);

      if (showAtmosphere) {
      
      const atmosphereMaterial = createAtmosphereMaterial();
      const atmosphereGeometry = new THREE.SphereGeometry(3.1, 64, 64);
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      sceneRef.current.add(atmosphere);

      }
      cameraRef.current.position.z = 5;

      controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
      controlsRef.current.update();

      const animate = () => {
        requestAnimationFrame(animate);
        earth.rotation.y += earthRotationSpeed;
        // clouds.rotation.y += cloudsRotationSpeed;
        controlsRef.current.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      };

      animate();
    }

    return () => {
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} />;
}

export default EarthComponent;