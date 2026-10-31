import { useSearchParams } from "react-router-dom";
import useSearchContext from "@/features/hotels/hooks/useSearchContext";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { hotelKeys } from "@/shared/lib/query-keys";
import * as hotelsApi from "@/features/hotels/api";
import { useEffect, useState } from "react";
import SearchResultsCard from "@/features/hotels/components/SearchResultsCard";
import { Pagination } from "@hotel-booking/ui";
import StarRatingFilter from "@/features/hotels/components/StarRatingFilter";
import HotelTypesFilter from "@/features/hotels/components/HotelTypesFilter";
import FacilitiesFilter from "@/features/hotels/components/FacilitiesFilter";
import PriceFilter from "@/features/hotels/components/PriceFilter";
import SearchBar from "@/features/hotels/components/SearchBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hotel-booking/ui";
import { SelectOptionLabel } from "@hotel-booking/ui";
import { SEARCH_PAGE_SORT_OPTIONS } from "@/features/hotels/lib/select-option-maps";

const Search = () => {
  const [urlSearchParams] = useSearchParams();
  const search = useSearchContext();
  const [page, setPage] = useState<number>(1);
  const urlQueryString = urlSearchParams.toString();
  const { saveSearchValues } = search;

  // Sync URL params to search context when navigating with query string (e.g. Hotels nav link)
  useEffect(() => {
    const params = new URLSearchParams(urlQueryString);
    const destination = params.get("destination");
    const checkIn = params.get("checkIn");
    const checkOut = params.get("checkOut");
    const adultCount = params.get("adultCount");
    const childCount = params.get("childCount");
    if (checkIn && checkOut) {
      saveSearchValues(
        destination || "",
        new Date(checkIn),
        new Date(checkOut),
        parseInt(adultCount || "1", 10),
        parseInt(childCount || "1", 10),
      );
    }
  }, [urlQueryString, saveSearchValues]);
  const [selectedStars, setSelectedStars] = useState<string[]>([]);
  const [selectedHotelTypes, setSelectedHotelTypes] = useState<string[]>([]);
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [selectedPrice, setSelectedPrice] = useState<number | undefined>();
  const [sortOption, setSortOption] = useState<string>("");

  const searchParams = {
    destination: search.destination?.trim() || "",
    checkIn: search.checkIn.toISOString(),
    checkOut: search.checkOut.toISOString(),
    adultCount: search.adultCount.toString(),
    childCount: search.childCount.toString(),
    page: page.toString(),
    stars: selectedStars,
    types: selectedHotelTypes,
    facilities: selectedFacilities,
    maxPrice: selectedPrice?.toString(),
    sortOption,
  };

  const { data: hotelData, isLoading: isSearchLoading } = useQuery({
    queryKey: hotelKeys.search(searchParams),
    queryFn: () => hotelsApi.searchHotels(searchParams),
    placeholderData: keepPreviousData,
  });

  const handleStarsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const starRating = event.target.value;

    setSelectedStars((prevStars) =>
      event.target.checked
        ? [...prevStars, starRating]
        : prevStars.filter((star) => star !== starRating),
    );
  };

  const handleHotelTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const hotelType = event.target.value;

    setSelectedHotelTypes((prevHotelTypes) =>
      event.target.checked
        ? [...prevHotelTypes, hotelType]
        : prevHotelTypes.filter((hotel) => hotel !== hotelType),
    );
  };

  const handleFacilityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const facility = event.target.value;

    setSelectedFacilities((prevFacilities) =>
      event.target.checked
        ? [...prevFacilities, facility]
        : prevFacilities.filter((prevFacility) => prevFacility !== facility),
    );
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-xl border p-4">
        <h2 className="text-lg font-medium text-gray-700 mb-4">Modify Your Search</h2>
        <SearchBar />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-5">
        <div className="rounded-xl border border-slate-300 p-5 h-fit lg:sticky lg:top-10 order-2 lg:order-1">
          <div className="space-y-5">
            <h3 className="text-lg font-medium border-b border-slate-300 pb-5">Filter by:</h3>
            <StarRatingFilter selectedStars={selectedStars} onChange={handleStarsChange} />
            <HotelTypesFilter
              selectedHotelTypes={selectedHotelTypes}
              onChange={handleHotelTypeChange}
            />
            <FacilitiesFilter
              selectedFacilities={selectedFacilities}
              onChange={handleFacilityChange}
            />
            <PriceFilter
              selectedPrice={selectedPrice}
              onChange={(value?: number) => setSelectedPrice(value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-5 order-1 lg:order-2">
          <div className="flex justify-between items-center">
            <span className="text-xl font-medium">
              {isSearchLoading ? "Searching…" : `${hotelData?.pagination.total ?? 0} Hotels found`}
              {search.destination ? ` in ${search.destination}` : ""}
            </span>
            <Select
              value={sortOption || "default"}
              onValueChange={(v) => setSortOption(v === "default" ? "" : v)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_PAGE_SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <SelectOptionLabel icon={o.icon}>{o.label}</SelectOptionLabel>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isSearchLoading || hotelData === undefined ? (
            <div className="flex flex-col gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 bg-gray-100 rounded-xl animate-pulse border border-gray-100"
                />
              ))}
            </div>
          ) : hotelData.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="text-gray-400 mb-4">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-gray-700 mb-2">No hotels found</h3>
              <p className="text-gray-500 max-w-md">
                {search.destination ? (
                  <>
                    We couldn't find any hotels in{" "}
                    <span className="font-medium">{search.destination}</span>
                    {selectedStars.length > 0 && (
                      <>
                        {" "}
                        with {selectedStars.length === 1 ? "a" : ""} {selectedStars.join(", ")} star
                        rating
                      </>
                    )}
                    {selectedPrice && <> under ${selectedPrice} per night</>}.
                  </>
                ) : (
                  <>
                    We couldn't find any hotels matching your criteria
                    {selectedStars.length > 0 && (
                      <>
                        {" "}
                        with {selectedStars.length === 1 ? "a" : ""} {selectedStars.join(", ")} star
                        rating
                      </>
                    )}
                    {selectedPrice && <> under ${selectedPrice} per night</>}.
                  </>
                )}
              </p>
              <div className="mt-6 space-y-2 text-sm text-gray-400">
                <p>Try adjusting your filters or search for a different destination.</p>
                {selectedStars.length > 0 ||
                selectedHotelTypes.length > 0 ||
                selectedFacilities.length > 0 ||
                selectedPrice ? (
                  <button
                    onClick={() => {
                      setSelectedStars([]);
                      setSelectedHotelTypes([]);
                      setSelectedFacilities([]);
                      setSelectedPrice(undefined);
                      setSortOption("");
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear all filters
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {hotelData?.data.map((hotel: import("@hotel-booking/types").HotelType) => (
                <SearchResultsCard key={hotel._id} hotel={hotel} />
              ))}
              <div>
                <Pagination
                  page={hotelData?.pagination.page || 1}
                  pages={hotelData?.pagination.pages || 1}
                  onPageChange={(page) => setPage(page)}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Search;
