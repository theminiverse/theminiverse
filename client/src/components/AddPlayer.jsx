import { useState } from 'react';

export default function AddPlayer({ onAdd }) {
  const [name, setName] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, (res) => {
      if (res?.ok) setName('');
    });
  };

  return (
    <form className="add-player" onSubmit={submit}>
      <input
        className="input"
        placeholder="Add a player…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
      />
      <button className="btn" type="submit" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}
