import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@hotel-booking/ui";
import { Separator } from "@hotel-booking/ui";
import MobileNavLinks from "@/shared/components/layout/MobileNavLinks";

const MobileNav = () => {
  return (
    <Sheet>
      <SheetTrigger aria-label="Open menu">
        <Menu className="h-6 w-6 text-white" />
      </SheetTrigger>
      <SheetContent className="flex flex-col bg-white" side="right">
        <SheetTitle className="text-left text-gray-700">Menu</SheetTitle>
        <Separator />
        <SheetDescription className="flex-1 pt-4 flex flex-col text-left">
          <MobileNavLinks />
        </SheetDescription>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
