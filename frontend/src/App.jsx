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
              <Link to="/">Home</Link>
            </li>
          </ul>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jeu" element={<Jeu />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
