import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Container } from './container';

const ContainerContext = createContext<Container | undefined>(undefined);

export function ContainerProvider({
  container,
  children,
}: {
  container: Container;
  children: ReactNode;
}) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

/** Reaches the use cases from a component. Throws if the root forgot to provide them. */
export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) {
    throw new Error('useContainer was called outside ContainerProvider');
  }
  return container;
}
