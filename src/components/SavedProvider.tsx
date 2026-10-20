'use client';
import { createContext, useContext, useState } from 'react';
const SavedContext = createContext<{
  ids: string[];
  authenticated: boolean;
  setSaved: (id: string, value: boolean) => void;
}>({ ids: [], authenticated: false, setSaved: () => {} });
export function SavedProvider({
  initialIds,
  authenticated,
  children,
}: {
  initialIds: string[];
  authenticated: boolean;
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState(initialIds);
  return (
    <SavedContext.Provider
      value={{
        ids,
        authenticated,
        setSaved: (id, value) =>
          setIds((prev) => (value ? [...new Set([...prev, id])] : prev.filter((x) => x !== id))),
      }}
    >
      {children}
    </SavedContext.Provider>
  );
}
export const useSaved = () => useContext(SavedContext);
