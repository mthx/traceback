import { createContext, useContext, type ReactNode } from "react";

interface NavigationContextValue {
  navigateToRule: (ruleId: number) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}

interface NavigationProviderProps {
  children: ReactNode;
  onNavigateToRule: (ruleId: number) => void;
}

export function NavigationProvider({
  children,
  onNavigateToRule,
}: NavigationProviderProps) {
  return (
    <NavigationContext.Provider value={{ navigateToRule: onNavigateToRule }}>
      {children}
    </NavigationContext.Provider>
  );
}
