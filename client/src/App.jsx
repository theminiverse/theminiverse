import { useEffect, useState } from 'react';
import Home from './Home.jsx';
import Game from './Game.jsx';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to) => {
    window.history.pushState({}, '', to);
    setPath(to);
  };

  const match = path.match(/^\/g\/([A-Za-z0-9]+)/);
  if (match) {
    return <Game code={match[1].toUpperCase()} navigate={navigate} />;
  }
  return <Home navigate={navigate} />;
}
