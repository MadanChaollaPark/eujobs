'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const enabled = localStorage.getItem('eujobs-theme') === 'dark';
      document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
      setDark(enabled);
    } catch {}
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('eujobs-theme', next ? 'dark' : 'light');
    } catch {}
  }
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={toggle}
      aria-label={`Use ${dark ? 'light' : 'dark'} theme`}
      aria-pressed={dark}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
