import React, { useCallback, useMemo, useState } from "react";
import { clearHotelPlacesCache } from "@/shared/lib/hotel-places";

export type SearchContext = {
  destination: string;
  checkIn: Date;
  checkOut: Date;
  adultCount: number;
  childCount: number;
  hotelId: string;
  saveSearchValues: (
    destination: string,
    checkIn: Date,
    checkOut: Date,
    adultCount: number,
    childCount: number,
  ) => void;
  clearSearchValues: () => void;
};

export const SearchContext = React.createContext<SearchContext | undefined>(undefined);

type SearchContextProviderProps = {
  children: React.ReactNode;
};

export const SearchContextProvider = ({ children }: SearchContextProviderProps) => {
  const [destination, setDestination] = useState<string>(
    () => sessionStorage.getItem("destination") || "",
  );
  const [checkIn, setCheckIn] = useState<Date>(
    () => new Date(sessionStorage.getItem("checkIn") || new Date().toISOString()),
  );
  const [checkOut, setCheckOut] = useState<Date>(
    () => new Date(sessionStorage.getItem("checkOut") || new Date().toISOString()),
  );
  const [adultCount, setAdultCount] = useState<number>(() =>
    parseInt(sessionStorage.getItem("adultCount") || "1"),
  );
  const [childCount, setChildCount] = useState<number>(() =>
    parseInt(sessionStorage.getItem("childCount") || "1"),
  );
  // Session key is hotelId (legacy hotelID reads would never restore)
  const [hotelId, setHotelId] = useState<string>(() => sessionStorage.getItem("hotelId") || "");

  const saveSearchValues = useCallback(
    (
      destination: string,
      checkIn: Date,
      checkOut: Date,
      adultCount: number,
      childCount: number,
      hotelId?: string,
    ) => {
      setDestination(destination);
      setCheckIn(checkIn);
      setCheckOut(checkOut);
      setAdultCount(adultCount);
      setChildCount(childCount);
      if (hotelId) {
        setHotelId(hotelId);
      }

      sessionStorage.setItem("destination", destination);
      sessionStorage.setItem("checkIn", checkIn.toISOString());
      sessionStorage.setItem("checkOut", checkOut.toISOString());
      sessionStorage.setItem("adultCount", adultCount.toString());
      sessionStorage.setItem("childCount", childCount.toString());

      if (hotelId) {
        sessionStorage.setItem("hotelId", hotelId);
      }
    },
    [],
  );

  const clearSearchValues = useCallback(() => {
    setDestination("");
    setCheckIn(new Date());
    setCheckOut(new Date());
    setAdultCount(1);
    setChildCount(0);
    setHotelId("");

    sessionStorage.removeItem("destination");
    sessionStorage.removeItem("checkIn");
    sessionStorage.removeItem("checkOut");
    sessionStorage.removeItem("adultCount");
    sessionStorage.removeItem("childCount");
    sessionStorage.removeItem("hotelId");
    // Always drop soft destination cache on clear so next search sees fresh cities
    clearHotelPlacesCache();
  }, []);

  const value = useMemo(
    () => ({
      destination,
      checkIn,
      checkOut,
      adultCount,
      childCount,
      hotelId,
      saveSearchValues,
      clearSearchValues,
    }),
    [
      destination,
      checkIn,
      checkOut,
      adultCount,
      childCount,
      hotelId,
      saveSearchValues,
      clearSearchValues,
    ],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
};

// ...existing code...
