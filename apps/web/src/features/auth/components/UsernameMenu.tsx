import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hotel-booking/ui";
import { Link, useNavigate } from "react-router-dom";
import { Separator } from "@hotel-booking/ui";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "@/features/auth/api";
import { authKeys } from "@/shared/lib/query-keys";
import { Plus, LogOut, Building2, Shield, FileText, Activity } from "lucide-react";
import { useToast } from "@/shared/context/ToastContext";
import useAuth from "@/features/auth/hooks/useAuth";
import { goodbyeToast, getStoredDisplayName } from "@/shared/lib/toast-messages";
import { getAdminUrl } from "@/shared/lib/app-urls";

const getAvatarUrl = () => {
  const image = localStorage.getItem("user_image");
  const email = localStorage.getItem("user_email");
  const name = localStorage.getItem("user_name");
  const id = email || name || "user";
  if (image) return image;
  return `https://robohash.org/${encodeURIComponent(id)}.png?set=set1&size=80x80`;
};

const menuItemClass =
  "flex items-center py-2 rounded-xl cursor-pointer hover:bg-gray-100 focus:bg-gray-100";

const linkRowClass =
  "flex items-center gap-2 w-full text-sm font-normal leading-none text-gray-700 hover:text-primary-600";

const UsernameMenu = () => {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const email = localStorage.getItem("user_email");
  const name = localStorage.getItem("user_name");

  const avatarUrl = imgError
    ? `https://robohash.org/${email || "user"}.png?set=set1&size=80x80`
    : getAvatarUrl();

  const handleMenuClick = () => setIsOpen(false);

  // Soft logout: toast goodbye, clear auth queries, navigate — no full reload
  const handleLogout = async () => {
    const displayName = getStoredDisplayName();
    showToast(goodbyeToast(displayName));
    await authApi.signOut();
    setIsOpen(false);
    queryClient.removeQueries({ queryKey: authKeys.currentUser() });
    navigate("/");
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border-2 border-teal-400/80 p-0.5 focus:outline-none focus:ring-2 focus:ring-teal-300">
          <img
            src={avatarUrl}
            alt={name || email || "User"}
            className="h-9 w-9 rounded-full object-cover"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white p-2 shadow-xl">
        <div className="px-2 py-1">
          <p className="text-sm font-normal text-gray-700">{name || "User"}</p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
        <Separator className="my-2 bg-gray-200" />
        {currentUser?.role === "admin" && (
          <DropdownMenuItem onClick={handleMenuClick} asChild className={menuItemClass}>
            <a href={getAdminUrl()} className={linkRowClass}>
              <Shield className="h-4 w-4" />
              Admin Panel
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleMenuClick} asChild className={menuItemClass}>
          <Link to="/add-hotel" className={linkRowClass}>
            <Plus className="h-4 w-4" />
            Add Hotel
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMenuClick} asChild className={menuItemClass}>
          <Link to="/my-hotels" className={linkRowClass}>
            <Building2 className="h-4 w-4" />
            My Hotels
          </Link>
        </DropdownMenuItem>
        {/* API links moved from MainNav — logged-in profile only */}
        <DropdownMenuItem onClick={handleMenuClick} asChild className={menuItemClass}>
          <Link to="/api-docs" className={linkRowClass}>
            <FileText className="h-4 w-4" />
            API Documentation
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMenuClick} asChild className={menuItemClass}>
          <Link to="/api-status" className={linkRowClass}>
            <Activity className="h-4 w-4" />
            API Status
          </Link>
        </DropdownMenuItem>
        <Separator className="my-2 bg-gray-200" />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleLogout();
          }}
          className={`${menuItemClass} text-red-600 focus:text-red-700 focus:bg-red-50`}
        >
          <span className="flex items-center gap-2 w-full text-sm font-normal leading-none">
            <LogOut className="h-4 w-4" />
            Logout
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UsernameMenu;
