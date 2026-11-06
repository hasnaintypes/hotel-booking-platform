import { FormProvider, useForm } from "react-hook-form";
import DetailsSection from "@/features/hotel-management/components/ManageHotelForm/DetailsSection";
import TypeSection from "@/features/hotel-management/components/ManageHotelForm/TypeSection";
import FacilitiesSection from "@/features/hotel-management/components/ManageHotelForm/FacilitiesSection";
import GuestsSection from "@/features/hotel-management/components/ManageHotelForm/GuestsSection";
import ImagesSection from "@/features/hotel-management/components/ManageHotelForm/ImagesSection";
import ContactSection from "@/features/hotel-management/components/ManageHotelForm/ContactSection";
import PoliciesSection from "@/features/hotel-management/components/ManageHotelForm/PoliciesSection";
import { HotelType } from "@hotel-booking/types";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@hotel-booking/ui";
import type { HotelFormPayload } from "@/features/hotel-management/api";

export type HotelFormData = {
  name: string;
  city: string;
  country: string;
  description: string;
  type: string[];
  pricePerNight: number;
  starRating: number;
  facilities: string[];
  imageFiles?: FileList;
  imageUrls: string[];
  adultCount: number;
  childCount: number;
  // New fields
  contact?: {
    phone: string;
    email: string;
    website: string;
  };
  policies?: {
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicy: string;
    petPolicy: string;
    smokingPolicy: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    address: {
      street: string;
      city: string;
      state: string;
      country: string;
      zipCode: string;
    };
  };
  isFeatured: boolean;
};

type Props = {
  hotel?: HotelType;
  onSave: (payload: HotelFormPayload, imageFiles: File[]) => void;
  isLoading: boolean;
  /** When set, show Cancel (calls this) + Back link to My Hotels */
  onCancel?: () => void;
  showBack?: boolean;
};

const ManageHotelForm = ({ onSave, isLoading, hotel, onCancel, showBack = false }: Props) => {
  const formMethods = useForm<HotelFormData>();
  const { handleSubmit, reset } = formMethods;

  useEffect(() => {
    if (hotel) {
      // Ensure contact and policies are properly initialized
      const formData = {
        ...hotel,
        contact: hotel.contact || {
          phone: "",
          email: "",
          website: "",
        },
        policies: hotel.policies || {
          checkInTime: "",
          checkOutTime: "",
          cancellationPolicy: "",
          petPolicy: "",
          smokingPolicy: "",
        },
      };
      reset(formData);
    }
  }, [hotel, reset]);

  const onSubmit = handleSubmit((formDataJson: HotelFormData) => {
    const payload: HotelFormPayload = {
      name: formDataJson.name,
      city: formDataJson.city,
      country: formDataJson.country,
      description: formDataJson.description,
      type: formDataJson.type,
      facilities: formDataJson.facilities,
      pricePerNight: formDataJson.pricePerNight,
      starRating: formDataJson.starRating,
      adultCount: formDataJson.adultCount,
      childCount: formDataJson.childCount,
      imageUrls: formDataJson.imageUrls ?? [],
      "contact.phone": formDataJson.contact?.phone || "",
      "contact.email": formDataJson.contact?.email || "",
      "contact.website": formDataJson.contact?.website || "",
      "policies.checkInTime": formDataJson.policies?.checkInTime || "",
      "policies.checkOutTime": formDataJson.policies?.checkOutTime || "",
      "policies.cancellationPolicy": formDataJson.policies?.cancellationPolicy || "",
      "policies.petPolicy": formDataJson.policies?.petPolicy || "",
      "policies.smokingPolicy": formDataJson.policies?.smokingPolicy || "",
    };

    const imageFiles = formDataJson.imageFiles ? Array.from(formDataJson.imageFiles) : [];
    onSave(payload, imageFiles);
  });

  return (
    <FormProvider {...formMethods}>
      <form className="flex flex-col gap-10" onSubmit={onSubmit}>
        <DetailsSection />
        <TypeSection />
        <FacilitiesSection />
        <GuestsSection />
        <ContactSection />
        <PoliciesSection />
        <ImagesSection />
        <span className="flex flex-wrap justify-end gap-3">
          {showBack && (
            <Button type="button" variant="outline" asChild>
              <Link to="/my-hotels">Back</Link>
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="secondary" disabled={isLoading} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            disabled={isLoading}
            type="submit"
            className="bg-blue-600 text-white hover:bg-blue-500 text-lg px-6"
          >
            {isLoading ? "Saving..." : hotel ? "Update" : "Save"}
          </Button>
        </span>
      </form>
    </FormProvider>
  );
};

export default ManageHotelForm;
