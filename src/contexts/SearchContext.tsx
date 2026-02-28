import { createContext, useContext, useState, ReactNode } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

interface SearchState {
  searchTerm: string;
  country: string;
  industry: string;
  resultLimit: string;
  results: Company[];
  searchDone: boolean;
  statusMessage: string;
}

interface SearchContextType extends SearchState {
  setSearchTerm: (v: string) => void;
  setCountry: (v: string) => void;
  setIndustry: (v: string) => void;
  setResultLimit: (v: string) => void;
  setResults: React.Dispatch<React.SetStateAction<Company[]>>;
  setSearchDone: (v: boolean) => void;
  setStatusMessage: (v: string) => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [resultLimit, setResultLimit] = useState("25");
  const [results, setResults] = useState<Company[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  return (
    <SearchContext.Provider value={{
      searchTerm, setSearchTerm,
      country, setCountry,
      industry, setIndustry,
      resultLimit, setResultLimit,
      results, setResults,
      searchDone, setSearchDone,
      statusMessage, setStatusMessage,
    }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearchContext() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearchContext must be used within SearchProvider");
  return ctx;
}
