import { useContext } from "react";
import { AppContext } from "@/shared/context/AppContext";
import type { AppContext as AppContextType } from "@/shared/context/AppContext";

const useAppContext = () => {
  const context = useContext(AppContext);
  return context as AppContextType;
};

export default useAppContext;
