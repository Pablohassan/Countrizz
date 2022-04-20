import Jeu from "@pages/Jeu";
import Home from "@pages/Home";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

// import GlobeTest from "@pages/GlobeTest";

import "./App.css";

function App() {
  return (
    <Router>
      <div className="App">
        <nav>
          <ul>
            <li>
              <Link to="pages/Home">Home</Link>
            </li>
          </ul>
        </nav>
        <Routes>
          <Route path="/pages/Jeu" element={<Jeu />} />
          <Route path="/pages/Home" element={<Home />} />
          <Route path="/" element={<Home />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
