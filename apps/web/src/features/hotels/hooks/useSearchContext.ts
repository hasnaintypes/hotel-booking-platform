import { useContext } from "react";
import { SearchContext } from "@/features/hotels/context/SearchContext";
import type { SearchContext as SearchContextType } from "@/features/hotels/context/SearchContext";

const useSearchContext = () => {
  const context = useContext(SearchContext);
  return context as SearchContextType;
};

export default useSearchContext;
