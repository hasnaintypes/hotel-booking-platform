import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ManageHotelForm from "@/features/hotel-management/components/ManageHotelForm/ManageHotelForm";
import { useToast } from "@/shared/context/ToastContext";
import * as hotelManagementApi from "@/features/hotel-management/api";
import { invalidateHotelQueries } from "@/shared/lib/query-invalidation";

const AddHotel = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mutate, isPending: isLoading } = useMutation({
    mutationFn: hotelManagementApi.addMyHotel,
    onSuccess: async () => {
    // Refresh My Hotels / Home / Search caches without full reload
    await invalidateHotelQueries(queryClient);
    showToast({
      title: "Hotel Added Successfully",
      description:
        "Your hotel has been added to the platform successfully! Redirecting to My Hotels...",
      type: "SUCCESS",
    });
    setTimeout(() => {
      navigate("/my-hotels");
    }, 1500);
  },
  onError: () => {
    showToast({
      title: "Failed to Add Hotel",
      description: "There was an error saving your hotel. Please try again.",
      type: "ERROR",
    });
  },
  });

  const handleSave = (hotelFormData: FormData) => {
    mutate(hotelFormData);
  };

  return <ManageHotelForm onSave={handleSave} isLoading={isLoading} showBack />;
};

export default AddHotel;
