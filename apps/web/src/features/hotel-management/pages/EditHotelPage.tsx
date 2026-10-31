import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import * as hotelManagementApi from "@/features/hotel-management/api";
import ManageHotelForm from "@/features/hotel-management/components/ManageHotelForm/ManageHotelForm";
import { useToast } from "@/shared/context/ToastContext";
import { invalidateHotelQueries } from "@/shared/lib/query-invalidation";
import { hotelKeys } from "@/shared/lib/query-keys";

const EditHotel = () => {
  const { hotelId } = useParams();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: hotel } = useQuery({
    queryKey: hotelKeys.mineDetail(hotelId || ""),
    queryFn: () => hotelManagementApi.fetchMyHotelById(hotelId || ""),
    enabled: !!hotelId,
  });

  const { mutate, isPending: isLoading } = useMutation({
    mutationFn: hotelManagementApi.updateMyHotelById,
    onSuccess: async () => {
    await invalidateHotelQueries(queryClient);
    showToast({
      title: "Hotel Updated Successfully",
      description:
        "Your hotel details have been updated successfully! Redirecting to My Hotels...",
      type: "SUCCESS",
    });
    setTimeout(() => {
      navigate("/my-hotels");
    }, 1500);
  },
  onError: () => {
    showToast({
      title: "Failed to Update Hotel",
      description:
        "There was an error updating your hotel. Please try again.",
      type: "ERROR",
    });
  },
  });

  const handleSave = (hotelFormData: FormData) => {
    mutate(hotelFormData);
  };

  // Cancel discards edits and returns to My Hotels without saving
  const handleCancel = () => {
    navigate("/my-hotels");
  };

  return (
    <ManageHotelForm
      hotel={hotel}
      onSave={handleSave}
      isLoading={isLoading}
      onCancel={handleCancel}
      showBack
    />
  );
};

export default EditHotel;
