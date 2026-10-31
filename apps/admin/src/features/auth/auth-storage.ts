export const getUserDetails = () => ({
  email: localStorage.getItem("user_email") || "",
  name: localStorage.getItem("user_name") || "",
});

export const clearUserDetails = () => {
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_image");
};
